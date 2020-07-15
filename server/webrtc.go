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
	partyLine      *WebRTCPartyLine
	ctx            context.Context
	peerConnection *webrtc.PeerConnection
	tracks         []TrackAndPLI

	UserInfo       uint32
	SendToPeer     func(interface{})
	SendMidMapping func(map[uint32][]string)
}

func NewWebRTCPartyLine(configIn json.RawMessage) *WebRTCPartyLine {
	var config webrtc.Configuration
	if err := json.Unmarshal(configIn, &config); err != nil {
		panic(err)
	}

	mediaEngine := webrtc.MediaEngine{}
	// mediaEngine.RegisterDefaultCodecs()
	mediaEngine.RegisterCodec(webrtc.NewRTPOpusCodec(webrtc.DefaultPayloadTypeOpus, 48000))
	mediaEngine.RegisterCodec(webrtc.NewRTPPCMUCodec(webrtc.DefaultPayloadTypePCMU, 8000))
	mediaEngine.RegisterCodec(webrtc.NewRTPPCMACodec(webrtc.DefaultPayloadTypePCMA, 8000))
	mediaEngine.RegisterCodec(webrtc.NewRTPG722Codec(webrtc.DefaultPayloadTypeG722, 8000))
	mediaEngine.RegisterCodec(webrtc.NewRTPVP8Codec(webrtc.DefaultPayloadTypeVP8, 90000))
	mediaEngine.RegisterCodec(webrtc.NewRTPH264Codec(webrtc.DefaultPayloadTypeH264, 90000))

	api := webrtc.NewAPI(webrtc.WithMediaEngine(mediaEngine))
	return &WebRTCPartyLine{
		mediaEngine: mediaEngine,
		api:         api,
		config:      config,
	}
}

func (pl *WebRTCPartyLine) AddPeer(ctx context.Context, p *WebRTCPartyLinePeer) error {
	p.partyLine = pl
	p.ctx = ctx

	var err error
	p.peerConnection, err = webrtc.NewPeerConnection(p.partyLine.config)
	if err != nil {
		return err
	}
	p.partyLine.peerListMutex.RLock()
	for _, peer := range p.partyLine.peers {
		for _, track := range peer.tracks {
			err = p.AddTrack(peer.ctx, track.track, track.pliChan)
			if err != nil {
				fmt.Println("err tracking up: ", err)
			}
		}
	}
	p.partyLine.peerListMutex.RUnlock()

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
			// fmt.Println("TRACK UPPP ", track.PayloadType(), track.SSRC(), track.ID(), track.Label())
			err = peer.AddTrack(ctx, localTrack, pliChan)
			if err != nil {
				fmt.Println("err tracking upp: ", err)
			}
		}
		p.partyLine.peerListMutex.RUnlock()

		pliChan <- true
	})

	pl.peerListMutex.Lock()
	pl.peers = append(pl.peers, p)
	pl.peerListMutex.Unlock()
	go func() {
		<-ctx.Done()
		pl.RemovePeer(p)
	}()
	return nil
}

func (pl *WebRTCPartyLine) RemovePeer(p *WebRTCPartyLinePeer) {
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

func (p *WebRTCPartyLinePeer) SendOffer() error {
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

func (p *WebRTCPartyLinePeer) AcceptOffer(offer webrtc.SessionDescription) error {
	if err := p.peerConnection.SetRemoteDescription(offer); err != nil {
		return err
	}
	answer, err := p.peerConnection.CreateAnswer(nil)
	if err != nil {
		return err
	}
	err = p.peerConnection.SetLocalDescription(answer)
	if err != nil {
		return err
	}
	p.SendToPeer([]interface{}{"answer", answer})
	return p.UpdateMidMapping()
}

func (p *WebRTCPartyLinePeer) AddTrack(ctx context.Context, track *webrtc.Track, pliChan chan bool) error {
	transceiversBefore := len(p.peerConnection.GetTransceivers())
	sender, err := p.peerConnection.AddTrack(track)
	if err != nil {
		return err
	}
	if len(p.peerConnection.GetTransceivers()) > transceiversBefore {
		switch track.Kind() {
		case webrtc.RTPCodecTypeAudio:
			p.SendToPeer([]interface{}{"addtransceiver", "audio"})
		case webrtc.RTPCodecTypeVideo:
			p.SendToPeer([]interface{}{"addtransceiver", "video"})
		}
	} else {
		p.SendToPeer([]interface{}{"renegotiate", nil})
	}
	go func() {
		select {
		case <-ctx.Done():
			if err := p.peerConnection.RemoveTrack(sender); err != nil {
				fmt.Println("error removing old track: ", err)
			}
			p.SendToPeer([]interface{}{"renegotiate", nil})
		case <-p.ctx.Done():
		}
	}()
	return nil
}

// Fucking yikes. There's gotta be a better way to do this.
func (p *WebRTCPartyLinePeer) UpdateMidMapping() error {
	mapping := make(map[uint32][]string)
	transceivers := p.peerConnection.GetTransceivers()
	p.partyLine.peerListMutex.RLock()
	for _, peer := range p.partyLine.peers {
		for _, track := range peer.tracks {
			for _, transceiver := range transceivers {
				mid := transceiver.Mid()
				if mid == "" {
					continue
				}
				sender := transceiver.Sender()
				if sender == nil {
					continue
				}
				if transceiver.Sender().Track() == track.track {
					mapping[peer.UserInfo] = append(mapping[peer.UserInfo], mid)
				}
			}
		}
	}
	p.partyLine.peerListMutex.RUnlock()
	p.SendMidMapping(mapping)
	return nil
}

func (p *WebRTCPartyLinePeer) HandleMessage(message json.RawMessage) error {
	var messagePieces []json.RawMessage
	if err := json.Unmarshal(message, &messagePieces); err != nil {
		return err
	}
	if len(messagePieces) != 2 {
		return errors.New(fmt.Sprint("malformed rtc message: ", messagePieces))
	}
	var messageType string
	if err := json.Unmarshal(messagePieces[0], &messageType); err != nil {
		return errors.New(fmt.Sprint("failed to unmarshal rtc message type: ", string(message)))
	}
	messageBody := messagePieces[1]
	switch messageType {
	case "offer":
		var sessionDescription webrtc.SessionDescription
		if err := json.Unmarshal(messageBody, &sessionDescription); err != nil {
			fmt.Println("failed to unmarshal rtc offer: ", messageBody)
		}
		return p.AcceptOffer(sessionDescription)
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
