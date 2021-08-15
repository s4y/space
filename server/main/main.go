package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/websocket"
	"github.com/s4y/reserve"
	"github.com/s4y/space/knobs"
	"github.com/s4y/space/world"
)

var defaultWorld = world.World{}

func readConfig(staticDir string) {
	configFile, err := os.Open(filepath.Join(staticDir, "config.json"))
	if err != nil {
		panic(err)
	}
	if err := json.NewDecoder(configFile).Decode(&config); err != nil {
		panic(err)
	}
}

var partyLine *WebRTCPartyLine
var config struct {
	Knobs            map[string]interface{} `json:"knobs"`
	SeeAndHear       *bool                  `json:"seeAndHear,omitempty"`
	Chat             *bool                  `json:"chat,omitempty"`
	RTCConfiguration json.RawMessage        `json:"rtcConfiguration"`
}

var globalKnobs knobs.Knobs = knobs.Knobs{}

type ClockResponse struct {
	StartTime  float64 `json:"startTime"`
	ServerTime int64   `json:"serverTime"`
}

func handleClock(msg json.RawMessage) (ClockResponse, error) {
	var clockMessage struct {
		StartTime float64 `json:"startTime"`
	}
	err := json.Unmarshal(msg, &clockMessage)
	if err != nil {
		return ClockResponse{}, err
	}
	return ClockResponse{
		clockMessage.StartTime,
		time.Now().UnixNano() / int64(time.Millisecond),
	}, nil
}

func startManagementServer(managementAddr string, managementStaticDir string) {
	mux := http.NewServeMux()
	mux.Handle("/", reserve.FileServer(http.Dir(managementStaticDir)))

	fmt.Printf("Management UI (only) at http://%s/\n", managementAddr)
	server := http.Server{Addr: managementAddr, Handler: mux}

	upgrader := websocket.Upgrader{}

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		ch := make(chan interface{}, 16)
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case msg := <-ch:
					conn.WriteJSON(msg)
				}
			}
		}()
		defaultWorld.Observe(ctx, world.WorldEventGuestJoined, func(seq uint32, g *world.Guest) {
			ch <- world.MakeGuestUpdateMessage(seq, g)
		})
		defaultWorld.Observe(ctx, world.WorldEventGuestUpdated, func(seq uint32, g *world.Guest) {
			ch <- world.MakeGuestUpdateMessage(seq, g)
		})
		for seq, g := range defaultWorld.GetGuests() {
			ch <- world.MakeGuestUpdateMessage(seq, g)
		}
		defaultWorld.Observe(ctx, world.WorldEventGuestDebug, func(seq uint32, k string, v interface{}) {
			ch <- world.MakeClientMessage(
				"guestDebug",
				struct {
					Id    uint32                 `json:"id"`
					Debug map[string]interface{} `json:"debug"`
				}{seq, map[string]interface{}{k: v}})
		})
		defaultWorld.Observe(ctx, world.WorldEventGuestLeft, func(seq uint32) {
			ch <- world.MakeClientMessage(
				"guestLeaving",
				struct {
					Id uint32 `json:"id"`
				}{seq})
		})
		globalKnobs.Observe(ctx, knobs.KnobChanged, func(name string, value interface{}) {
			ch <- world.MakeClientMessage(
				"knob",
				knobs.KnobMessage{
					Name:  name,
					Value: value,
				})
		})
		var msg world.ClientMessage
		for {
			if err = conn.ReadJSON(&msg); err != nil {
				break
			}
			switch msg.Type {
			case "setKnob":
				var knob knobs.KnobMessage
				if err := json.Unmarshal(msg.Body, &knob); err != nil {
					fmt.Println("knob unmarshal err", err)
				}
				globalKnobs.Set(knob.Name, knob.Value)
			case "broadcast":
				defaultWorld.BroadcastFrom(0, msg.Body)
			case "clock":
				res, err := handleClock(msg.Body)
				if err != nil {
					fmt.Println(err)
					break
				}
				conn.WriteJSON(world.MakeClientMessage("pong", res))
			case "kick":
				var kickMsg struct {
					GuestId uint32 `json:"id"`
					Kind    string `json:"kind"`
				}
				if err := json.Unmarshal(msg.Body, &kickMsg); err != nil {
					fmt.Println(err)
					break
				}
				guest, ok := defaultWorld.GetGuests()[kickMsg.GuestId]
				if !ok {
					break
				}
				guest.Kick(kickMsg.Kind)
			default:
				fmt.Println("unknown message:", msg)
			}
		}
	})

	log.Fatal(server.ListenAndServe())
}

func main() {
	staticDir := flag.String("static", "../static-default", "Directory for static content")
	managementStaticDir := flag.String("static-management", "../static-management", "Directory for management static content")
	httpAddr := flag.String("http", "127.0.0.1:8031", "Listening address")
	production := flag.Bool("p", false, "Production (disables automatic hot reloading)")
	trustXRealIP := flag.Bool("trust-x-real-ip", false, "Trust the X-Real-IP header, if provided; useful for reverse proxies")
	managementAddr := flag.String("management", "127.0.0.1:8034", "Listening address for admin pages")
	flag.Parse()
	fmt.Printf("http://%s/\n", *httpAddr)

	readConfig(*staticDir)
	if config.SeeAndHear != nil && *config.SeeAndHear == false {
	} else {
		partyLine = NewWebRTCPartyLine(config.RTCConfiguration)
	}

	ln, err := net.Listen("tcp", *httpAddr)
	if err != nil {
		log.Fatal(err)
	}

	for name, value := range config.Knobs {
		globalKnobs.Set(name, value)
	}

	upgrader := websocket.Upgrader{}

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		ip := ""
		guest := world.MakeGuest(ctx, conn)
		if *trustXRealIP == true {
			ip = r.Header.Get("X-Real-IP")
		} else {
			ip, _, _ = net.SplitHostPort(r.RemoteAddr)
		}
		if ip != "" {
			guest.DebugInfo.Store("ip", ip)
			go (func() {
				names, err := net.LookupAddr(ip)
				if err != nil {
					fmt.Println("LookupAddr err", err)
					return
				}
				guest.DebugInfo.Store("ip_names", names)
			})()
		}
		var msg world.ClientMessage
		var seq uint32

		globalKnobs.Observe(ctx, knobs.KnobChanged, func(name string, value interface{}) {
			guest.Write(world.MakeClientMessage("knob", knobs.KnobMessage{
				Name:  name,
				Value: value,
			}))
		})

		rtcPeer := WebRTCPartyLinePeer{
			SendToPeer: func(message interface{}) {
				guest.Write(world.MakeClientMessage("rtc", struct {
					From    uint32      `json:"from"`
					Message interface{} `json:"message"`
				}{0, message}))
			},
			MapTrack: func(mid string, id uint32) {
				guest.Write(world.MakeClientMessage("mapTrack", struct {
					Mid string `json:"mid"`
					Id  uint32 `json:"id"`
				}{mid, id}))
			},
			MaxBandwidth: 500000,
		}

		for {
			if err = conn.ReadJSON(&msg); err != nil {
				break
			}
			switch msg.Type {
			case "join":
				if seq != 0 {
					defaultWorld.Rejoin(seq)
				} else {
					var state world.GuestState
					err := json.Unmarshal(msg.Body, &state)
					if err != nil {
						fmt.Println(err)
						return
					}
					guest.Public.GuestState = state
					if state.Role == "cast" {
						rtcPeer.MaxBandwidth = 5000000
					}
					seq = defaultWorld.AddGuest(ctx, guest)
					rtcPeer.UserInfo = seq
					defaultWorld.UpdateGuest(seq)

					if partyLine != nil {
						if err := partyLine.AddPeer(ctx, &rtcPeer); err != nil {
							fmt.Println("err creating peerconnection ", seq, err)
							return
						}
					}
				}
			case "state":
				if seq == 0 {
					fmt.Println("client tried to send state without joining first ", conn.RemoteAddr().String())
					break
				}
				var state world.GuestState
				err := json.Unmarshal(msg.Body, &state)
				if err != nil {
					fmt.Println(err)
					break
				}
				guest.Public.GuestState = state
				defaultWorld.UpdateGuest(seq)
			case "debug.fps":
				var fps float64
				if err := json.Unmarshal(msg.Body, &fps); err != nil {
					fmt.Println("bad fps value from ", seq)
				}
				defaultWorld.SetGuestDebug(seq, "fps", fps)
			case "getKnobs":
				for name, value := range globalKnobs.Get() {
					guest.Write(world.MakeClientMessage("knob", knobs.KnobMessage{
						Name:  name,
						Value: value,
					}))
				}
			case "rtc":
				if partyLine == nil {
					break
				}
				var messageIn struct {
					To      uint32          `json:"to"`
					Message json.RawMessage `json:"message"`
				}
				err := json.Unmarshal(msg.Body, &messageIn)
				if err != nil {
					fmt.Println(err)
					break
				}
				if err := rtcPeer.HandleMessage(messageIn.Message); err != nil {
					fmt.Println("malformed rtc message from", seq, string(messageIn.Message), err)
				}
			case "chat":
				if config.Chat != nil && *config.Chat == false {
					break
				}
				var chatMessage struct {
					Message string `json:"message"`
				}

				err := json.Unmarshal(msg.Body, &chatMessage)
				if err != nil {
					fmt.Println(err)
					break
				}

				outboundMessage := world.MakeClientMessage("chat", struct {
					From    uint32      `json:"from"`
					Message interface{} `json:"message"`
				}{seq, chatMessage.Message})

				defaultWorld.BroadcastFrom(seq, outboundMessage)
			case "clock":
				res, err := handleClock(msg.Body)
				if err != nil {
					fmt.Println(err)
					break
				}
				guest.Write(world.MakeClientMessage("pong", res))
			default:
				fmt.Println("unknown message:", msg)
			}
		}
		return
	})
	// http.Handle("/astream/", http.FileServer(http.Dir(".")))
	if *production {
		fileServer := http.FileServer(http.Dir(*staticDir))
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "must-revalidate")
			w.Header().Set("Vary", "*")
			fileServer.ServeHTTP(w, r)
		})
	} else {
		http.Handle("/", reserve.FileServer(http.Dir(*staticDir)))
	}

	go startManagementServer(*managementAddr, *managementStaticDir)
	log.Fatal(http.Serve(ln, nil))
}
