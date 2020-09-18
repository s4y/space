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
	"sync"

	"github.com/gorilla/websocket"
	"github.com/s4y/reserve"
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
	RTCConfiguration json.RawMessage `json:"rtcConfiguration"`
}

type Knob struct {
	Name  string      `json:"name"`
	Value interface{} `json:"value"`
}

var knobsMutex sync.RWMutex
var knobs map[string]interface{} = make(map[string]interface{})

func startManagementServer(managementAddr string) {
	mux := http.NewServeMux()
	mux.Handle("/", reserve.FileServer("../static-management"))

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
		var msg world.ClientMessage
		for {
			if err = conn.ReadJSON(&msg); err != nil {
				break
			}
			switch msg.Type {
			case "setKnob":
				var knob Knob
				if err := json.Unmarshal(msg.Body, &knob); err != nil {
					fmt.Println("knob unmarshal err", err)
				}
				knobsMutex.Lock()
				knobs[knob.Name] = knob.Value
				knobsMutex.Unlock()
				defaultWorld.BroadcastFrom(0, world.MakeClientMessage("knob", knob))
			case "broadcast":
				defaultWorld.BroadcastFrom(0, msg.Body)
			default:
				fmt.Println("unknown message:", msg)
			}
		}
	})

	log.Fatal(server.ListenAndServe())
}

func main() {
	staticDir := flag.String("static", "../static-default", "Directory for static content")
	httpAddr := flag.String("http", "127.0.0.1:8031", "Listening address")
	production := flag.Bool("p", false, "Production (disables automatic hot reloading)")
	managementAddr := flag.String("management", "127.0.0.1:8034", "Listening address for admin pages")
	flag.Parse()
	fmt.Printf("http://%s/\n", *httpAddr)

	readConfig(*staticDir)
	partyLine = NewWebRTCPartyLine(config.RTCConfiguration)

	ln, err := net.Listen("tcp", *httpAddr)
	if err != nil {
		log.Fatal(err)
	}

	upgrader := websocket.Upgrader{}

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		guest := world.MakeGuest(ctx, conn)
		var msg world.ClientMessage
		var seq uint32

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
					seq = defaultWorld.AddGuest(ctx, guest)
					rtcPeer.UserInfo = seq
					defaultWorld.UpdateGuest(seq)

					if err := partyLine.AddPeer(ctx, &rtcPeer); err != nil {
						fmt.Println("err creating peerconnection ", seq, err)
						return
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
				knobsMutex.RLock()
				for name, value := range knobs {
					guest.Write(world.MakeClientMessage("knob", Knob{name, value}))
				}
				knobsMutex.RUnlock()
			case "rtc":
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
			fileServer.ServeHTTP(w, r)
		})
	} else {
		http.Handle("/", reserve.FileServer(http.Dir(*staticDir)))
	}

	go startManagementServer(*managementAddr)
	log.Fatal(http.Serve(ln, nil))
}
