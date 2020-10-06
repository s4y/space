package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtcp"
	webrtc "github.com/pion/webrtc/v3"
)

// Based on https://github.com/pion/webrtc/tree/master/examples/broadcast

const (
	rtcpPLIInterval = time.Second * 1
)

type WebRTCPartyLine struct {
	api    *webrtc.API
	config webrtc.Configuration

	peerListMutex sync.Mutex
	peers         atomic.Value // []*WebRTCPartyLinePeer
}

type WebRTCPartyLinePeer struct {
	partyLine        *WebRTCPartyLine
	ctx              context.Context
	tasks            chan func()
	peerConnection   *webrtc.PeerConnection
	tracks           []*webrtc.Track
	pendingMids      []func()
	makingOffer      bool
	sendAnotherOffer bool

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
		api:    api,
		config: config,
	}
}

func (pl *WebRTCPartyLine) AddPeer(ctx context.Context, p *WebRTCPartyLinePeer) error {
	p.partyLine = pl
	p.ctx = ctx
	p.tasks = make(chan func(), 64)

	var err error
	p.peerConnection, err = p.partyLine.api.NewPeerConnection(p.partyLine.config)
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

	p.peerConnection.CreateDataChannel("data", nil)

	p.peerConnection.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i != nil {
			p.SendToPeer([]interface{}{"icecandidate", i.ToJSON()})
		} else {
			p.SendToPeer([]interface{}{"icecandidate", nil})
		}
	})

	// https://github.com/pion/ice/issues/252
	p.peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateFailed {
			fmt.Println(p.UserInfo, "restart ice plz")
			p.tasks <- func() {
				p.sendOffer(true)
			}
		}
	})

	p.peerConnection.OnNegotiationNeeded(func() {
		p.tasks <- func() {
			p.sendOffer(false)
		}
	})

	p.peerConnection.OnTrack(func(track *webrtc.Track, receiver *webrtc.RTPReceiver) {
		p.tasks <- func() {
			localTrack, err := p.peerConnection.NewTrack(track.PayloadType(), track.SSRC(), track.ID(), track.Label())
			if err != nil {
				fmt.Println("OnTrack err ", err)
				return
			}
			pliChan := make(chan bool)

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
						fmt.Println("read error, bailing:", readErr)
						return
					}

					// ErrClosedPipe means we don't have any subscribers, this is ok if no peers have connected yet
					if _, err = localTrack.Write(rtpBuf[:i]); err != nil && err != io.ErrClosedPipe {
						fmt.Println("write error, ignoring:", err)
					}
				}
			}()

			p.tracks = append(p.tracks, localTrack)

			peers := p.partyLine.peers.Load().([]*WebRTCPartyLinePeer)
			for i := range peers {
				peer := peers[i]
				if peer == p {
					continue
				}
				if peer.peerConnection == nil {
					continue
				}
				peer.tasks <- func() {
					if err := peer.addTrack(p, localTrack); err != nil {
						fmt.Println("err tracking upp: ", err)
					}
				}
			}

			pliChan <- true
		}
	})

	pl.peerListMutex.Lock()
	if peers, ok := pl.peers.Load().([]*WebRTCPartyLinePeer); ok {
		pl.peers.Store(append(peers, p))
	} else {
		pl.peers.Store([]*WebRTCPartyLinePeer{p})
	}
	pl.peerListMutex.Unlock()

	go func() {
		for {
			select {
			case <-p.ctx.Done():
				return
			case task := <-p.tasks:
				task()
			}
		}
	}()

	go func() {
		<-ctx.Done()
		pl.RemovePeer(p)
	}()

	p.tasks <- func() {
		peers := p.partyLine.peers.Load().([]*WebRTCPartyLinePeer)
		for i := range peers {
			peer := peers[i]
			if peer == p {
				continue
			}
			peer.tasks <- func() {
				tracks := append([]*webrtc.Track(nil), peer.tracks...)
				p.tasks <- func() {
					for _, track := range tracks {
						if err := p.addTrack(peer, track); err != nil {
							fmt.Println("err tracking up: ", err)
						}
					}
				}
			}
		}
	}

	return nil
}

func (pl *WebRTCPartyLine) RemovePeer(p *WebRTCPartyLinePeer) {
	pl.peerListMutex.Lock()
	peers := p.partyLine.peers.Load().([]*WebRTCPartyLinePeer)
	for i, peer := range peers {
		if peer == p {
			pl.peers.Store(append(peers[:i], peers[i+1:]...))
			break
		}
	}
	pl.peerListMutex.Unlock()

	p.peerConnection.Close()
}

func (p *WebRTCPartyLinePeer) sendOffer(restartIce bool) error {
	if !restartIce && p.makingOffer {
		p.sendAnotherOffer = true
		return nil
	}
	p.makingOffer = true
	var opts *webrtc.OfferOptions
	if restartIce {
		opts = &webrtc.OfferOptions{ICERestart: true}
	}
	offer, err := p.peerConnection.CreateOffer(opts)
	if err != nil {
		return err
	}
	err = p.peerConnection.SetLocalDescription(offer)
	if err != nil {
		return err
	}
	for _, f := range p.pendingMids {
		f()
	}
	p.pendingMids = nil
	p.SendToPeer([]interface{}{"offer", offer})
	return nil
}

func (p *WebRTCPartyLinePeer) addTrack(peer *WebRTCPartyLinePeer, track *webrtc.Track) error {
	transceiver, err := p.peerConnection.AddTransceiverFromTrack(track)
	if err != nil {
		return err
	}

	p.pendingMids = append(p.pendingMids, func() {
		p.MapTrack(transceiver.Mid(), peer.UserInfo)
	})

	go func() {
		select {
		case <-peer.ctx.Done():
			if err := transceiver.Sender().Stop(); err != nil {
				fmt.Println("error removing old track: ", err)
			}
			p.tasks <- func() {
				if err := p.sendOffer(false); err != nil {
					fmt.Println("error sending offer after removing track: ", err)
				}
			}
		case <-p.ctx.Done():
		}
	}()
	return nil
}

func (p *WebRTCPartyLinePeer) HandleMessage(message json.RawMessage) error {
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
			fmt.Println("failed to unmarshal rtc answer: ", messageBody)
		}
		p.tasks <- func() {
			if err := p.peerConnection.SetRemoteDescription(sessionDescription); err != nil {
				fmt.Println("failed to use answer: ", err)
			}
			p.makingOffer = false
			if p.sendAnotherOffer {
				p.sendAnotherOffer = false
				p.sendOffer(false)
			}
		}
	case "renegotiate":
		p.tasks <- func() {
			if err := p.sendOffer(false); err != nil {
				fmt.Println("failed to renegotiate:", err)
			}
		}
	case "icecandidate":
		var candidate webrtc.ICECandidateInit
		if err := json.Unmarshal(messageBody, &candidate); err != nil {
			fmt.Println("failed to unmarshal ice candidate: ", messageBody)
		}
		if candidate.Candidate == "" {
			return nil
		}
		if p.peerConnection == nil {
			return errors.New("tried to add ice candidates w/o a peerconnection")
		}
		p.tasks <- func() {
			if err := p.peerConnection.AddICECandidate(candidate); err != nil {
				fmt.Println("failed to add ice candidate:", err)
			}
		}
	default:
		return errors.New(fmt.Sprint("unknown rtc message type: ", string(message)))
	}
	return nil
}
