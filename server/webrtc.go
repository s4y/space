package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/pion/rtcp"
	webrtc "github.com/pion/webrtc"
)

// Based on https://github.com/pion/webrtc/tree/master/examples/broadcast

const (
	rtcpPLIInterval = time.Second * 5
)

type WebRTCPartyLine struct {
	mediaEngine webrtc.MediaEngine
	api         *webrtc.API
	config      webrtc.Configuration

	peerListMutex sync.RWMutex
	peers         []*WebRTCPartyLinePeer
}

type TrackAndPLI struct {
	track   *webrtc.Track
	pliChan chan bool
}

type WebRTCPartyLinePeer struct {
	mutex          sync.RWMutex
	partyLine      *WebRTCPartyLine
	ctx            context.Context
	peerConnection *webrtc.PeerConnection
	tracks         []TrackAndPLI

	UserInfo   uint32
	SendToPeer func(interface{})
	MapTrack   func(string, uint32)
}

func NewWebRTCPartyLine(configIn json.RawMessage) *WebRTCPartyLine {
	var config webrtc.Configuration
	if err := json.Unmarshal(configIn, &config); err != nil {
		panic(err)
	}

	mediaEngine := webrtc.MediaEngine{}
	// mediaEngine.RegisterDefaultCodecs()
	mediaEngine.RegisterCodec(webrtc.NewRTPOpusCodec(webrtc.DefaultPayloadTypeOpus, 48000))
	// mediaEngine.RegisterCodec(webrtc.NewRTPPCMUCodec(webrtc.DefaultPayloadTypePCMU, 8000))
	// mediaEngine.RegisterCodec(webrtc.NewRTPPCMACodec(webrtc.DefaultPayloadTypePCMA, 8000))
	// mediaEngine.RegisterCodec(webrtc.NewRTPG722Codec(webrtc.DefaultPayloadTypeG722, 8000))
	mediaEngine.RegisterCodec(webrtc.NewRTPVP8Codec(webrtc.DefaultPayloadTypeVP8, 90000))
	// mediaEngine.RegisterCodec(webrtc.NewRTPH264Codec(webrtc.DefaultPayloadTypeH264, 90000))

	api := webrtc.NewAPI(webrtc.WithMediaEngine(mediaEngine))
	return &WebRTCPartyLine{
		mediaEngine: mediaEngine,
		api:         api,
		config:      config,
	}
}

func (pl *WebRTCPartyLine) AddPeer(ctx context.Context, p *WebRTCPartyLinePeer) error {
	pl.peerListMutex.Lock()
	defer pl.peerListMutex.Unlock()

	p.mutex.Lock()
	defer p.mutex.Unlock()

	p.partyLine = pl
	p.ctx = ctx

	var err error
	p.peerConnection, err = webrtc.NewPeerConnection(p.partyLine.config)
	if err != nil {
		return err
	}

	if _, err = p.peerConnection.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RtpTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		return err
	}
	if _, err = p.peerConnection.AddTransceiverFromKind(
		webrtc.RTPCodecTypeVideo,
		webrtc.RtpTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		return err
	}

	for _, peer := range p.partyLine.peers {
		peer.mutex.RLock()
		for _, track := range peer.tracks {
			err = p.addTrack(peer, track.track, track.pliChan)
			if err != nil {
				fmt.Println("err tracking up: ", err)
			}
		}
		peer.mutex.RUnlock()
	}

	p.peerConnection.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i != nil {
			p.SendToPeer([]interface{}{"icecandidate", i.ToJSON()})
		} else {
			p.SendToPeer([]interface{}{"icecandidate", nil})
		}
	})

	p.peerConnection.OnTrack(func(track *webrtc.Track, receiver *webrtc.RTPReceiver) {
		// fmt.Println("[TODO] got track:", track.SSRC(), track.ID(), track.Label())
		localTrack, err := p.peerConnection.NewTrack(track.PayloadType(), track.SSRC(), track.ID(), track.Label())
		if err != nil {
			fmt.Println("OnTrack err ", err)
			return
		}
		pliChan := make(chan bool)
		trackAndPli := TrackAndPLI{localTrack, pliChan}
		p.tracks = append(p.tracks, trackAndPli)

		// TODO
		go func() {
			ticker := time.NewTicker(rtcpPLIInterval)
			defer ticker.Stop()
			defer close(pliChan)
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					pliChan <- true
				}
			}
		}()

		go func() {
			for range pliChan {
				if rtcpSendErr := p.peerConnection.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: track.SSRC()}}); rtcpSendErr != nil {
					fmt.Println(rtcpSendErr)
				}
			}
		}()

		go func() {
			rtpBuf := make([]byte, 1400)
			for {
				i, readErr := track.Read(rtpBuf)
				if readErr == io.EOF {
					return
				}
				if readErr != nil {
					fmt.Println("readErr, bailing", readErr)
					return
				}

				// ErrClosedPipe means we don't have any subscribers, this is ok if no peers have connected yet
				if _, err = localTrack.Write(rtpBuf[:i]); err != nil && err != io.ErrClosedPipe {
					fmt.Println("read, Err, bailing", err)
					return
				}
			}
		}()

		p.partyLine.peerListMutex.RLock()
		for _, peer := range p.partyLine.peers {
			if peer == p {
				continue
			}
			if peer.peerConnection == nil {
				continue
			}
			peer.mutex.Lock()
			err = peer.addTrack(p, localTrack, pliChan)
			if err == nil {
				err = peer.sendOffer()
			}
			peer.mutex.Unlock()
			if err != nil {
				fmt.Println("err tracking upp: ", err)
			}
		}
		p.partyLine.peerListMutex.RUnlock()

		pliChan <- true
	})

	pl.peers = append(pl.peers, p)
	go func() {
		<-ctx.Done()
		pl.RemovePeer(p)
	}()
	return nil
}

func (pl *WebRTCPartyLine) RemovePeer(p *WebRTCPartyLinePeer) {
	p.mutex.Lock()
	defer p.mutex.Unlock()
	if p.peerConnection != nil {
		p.peerConnection.Close()
	}
	pl.peerListMutex.Lock()
	for i, peer := range pl.peers {
		if peer == p {
			pl.peers = append(pl.peers[:i], pl.peers[i+1:]...)
			break
		}
	}
	pl.peerListMutex.Unlock()
}

func (p *WebRTCPartyLinePeer) sendOffer() error {
	offer, err := p.peerConnection.CreateOffer(nil)
	if err != nil {
		return err
	}
	err = p.peerConnection.SetLocalDescription(offer)
	if err != nil {
		return err
	}
	p.SendToPeer([]interface{}{"offer", offer})
	return nil
}

func (p *WebRTCPartyLinePeer) addTrack(peer *WebRTCPartyLinePeer, track *webrtc.Track, pliChan chan bool) error {
	sender, err := p.peerConnection.AddTrack(track)
	if err != nil {
		return err
	}

	// Creating an offer is necessary to assign a mid to the new track, even if the offer isn't used.
	_, _ = p.peerConnection.CreateOffer(nil)

	for _, transceiver := range p.peerConnection.GetTransceivers() {
		if transceiver.Sender() == sender {
			p.MapTrack(transceiver.Mid(), peer.UserInfo)
			break
		}
	}
	go func() {
		select {
		case <-peer.ctx.Done():
			p.mutex.Lock()
			defer p.mutex.Unlock()
			if err := p.peerConnection.RemoveTrack(sender); err != nil {
				fmt.Println("error removing old track: ", err)
			}
			if err := p.sendOffer(); err != nil {
				fmt.Println("error sending offer after removing track: ", err)
			}
		case <-p.ctx.Done():
		}
	}()
	return nil
}

func (p *WebRTCPartyLinePeer) HandleMessage(message json.RawMessage) error {
	p.mutex.Lock()
	defer p.mutex.Unlock()
	var messagePieces []json.RawMessage
	if err := json.Unmarshal(message, &messagePieces); err != nil {
		return err
	}
	if len(messagePieces) != 2 {
		return errors.New(fmt.Sprint("malformed rtc message of length ", len(messagePieces), ": ", messagePieces))
	}
	var messageType string
	if err := json.Unmarshal(messagePieces[0], &messageType); err != nil {
		return errors.New(fmt.Sprint("failed to unmarshal rtc message type: ", string(message)))
	}
	messageBody := messagePieces[1]
	switch messageType {
	case "answer":
		var sessionDescription webrtc.SessionDescription
		if err := json.Unmarshal(messageBody, &sessionDescription); err != nil {
			fmt.Println("failed to unmarshal rtc offer: ", messageBody)
		}
		if err := p.peerConnection.SetRemoteDescription(sessionDescription); err != nil {
			fmt.Println("failed to use answer: ", err)
		}
		return nil
	case "renegotiate":
		return p.sendOffer()
	case "icecandidate":
		var candidate webrtc.ICECandidateInit
		if err := json.Unmarshal(messageBody, &candidate); err != nil {
			fmt.Println("failed to unmarshal ice candidate: ", messageBody)
		}
		if p.peerConnection == nil {
			return errors.New("tried to add ice candidates w/o a peerconnection")
		}
		return p.peerConnection.AddICECandidate(candidate)
	default:
		return errors.New(fmt.Sprint("unknown rtc message type: ", string(message)))
	}
}
