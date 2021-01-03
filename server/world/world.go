package world

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/s4y/space/util"
)

type Vec2 [2]float64
type Vec3 [3]float64

type GuestState struct {
	Position Vec3   `json:"position"`
	Look     Vec2   `json:"look"`
	Role     string `json:"role"`
}

type GuestPublic struct {
	GuestState
}

type Guest struct {
	Public    GuestPublic
	IPAddr    string
	DebugInfo sync.Map
	read      chan interface{}
	write     chan interface{}
	ctx       context.Context
	cancel    context.CancelFunc
}

func MakeGuest(ctx context.Context, conn *websocket.Conn) *Guest {
	childCtx, cancel := context.WithCancel(ctx)
	guest := &Guest{
		read:   make(chan interface{}),
		write:  make(chan interface{}, 100),
		ctx:    childCtx,
		cancel: cancel,
	}

	go func() {
		for msg := range guest.read {
			conn.WriteJSON(msg)
		}
	}()

	go func() {
		for msg := range guest.write {
			conn.WriteJSON(msg)
		}
	}()

	go func() {
		<-childCtx.Done()
		conn.Close()
		close(guest.read)
		// close(guest.write)
	}()

	return guest
}

func (g *Guest) Read(msg interface{}) (interface{}, error) {
	if msg, ok := <-g.read; ok {
		return msg, nil
	} else {
		return nil, errors.New("read from closed websocket")
	}
}

func (g *Guest) Write(msg interface{}) error {
	select {
	case <-g.ctx.Done():
		return errors.New("write to closed websocket")
	case g.write <- msg:
		return nil
	default:
		g.cancel()
		return errors.New(fmt.Sprint("full WebSocket, dropping connection."))
	}
}

type WorldEventType int

const (
	WorldEventGuestJoined WorldEventType = iota
	WorldEventGuestUpdated
	WorldEventGuestDebug
	WorldEventGuestLeft
)

type World struct {
	observers util.Observers

	mutex  sync.Mutex
	seq    uint32
	Guests map[uint32]*Guest `json:"guests"`
}

type ClientMessage struct {
	Type string          `json:"type"`
	Body json.RawMessage `json:"body"`
}

func MakeClientMessage(t string, message interface{}) ClientMessage {
	body, _ := json.Marshal(message)
	return ClientMessage{t, body}
}

func MakeGuestUpdateMessage(id uint32, guest *Guest) interface{} {
	return MakeClientMessage("guestUpdate", struct {
		Id    uint32      `json:"id"`
		State GuestPublic `json:"state"`
	}{id, guest.Public})
}

func (w *World) broadcast(m interface{}, skip uint32) {
	for k, v := range w.Guests {
		if k == skip {
			continue
		}
		v.Write(m)
	}
}

func (w *World) join(seq uint32, g *Guest) {
	g.Write(MakeClientMessage("hello", struct {
		Seq uint32 `json:"seq"`
	}{seq}))

	for k, v := range w.Guests {
		if v == g {
			continue
		}
		g.Write(MakeGuestUpdateMessage(k, v))
	}
}

func (w *World) sendDebug(seq uint32, o func(uint32, string, interface{})) {
	g := w.Guests[seq]
	g.DebugInfo.Range(func(key, value interface{}) bool {
		o(seq, key.(string), value)
		return true
	})
}

func (w *World) Observe(ctx context.Context, e WorldEventType, cb interface{}) {
	w.observers.Add(ctx, e, cb)
	switch e {
	case WorldEventGuestDebug:
		for seq := range w.GetGuests() {
			w.sendDebug(seq, cb.(func(uint32, string, interface{})))
		}
	}
}

func (w *World) GetGuests() map[uint32]*Guest {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	ret := map[uint32]*Guest{}
	for k, v := range w.Guests {
		ret[k] = v
	}
	return ret
}

func (w *World) AddGuest(ctx context.Context, g *Guest) uint32 {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.seq += 1
	seq := w.seq
	if w.Guests == nil {
		w.Guests = map[uint32]*Guest{}
	}
	w.Guests[seq] = g
	w.join(seq, g)
	go func() {
		<-ctx.Done()
		w.RemoveGuest(seq)
	}()
	for _, o := range w.observers.Get(WorldEventGuestJoined) {
		o.(func(uint32, *Guest))(seq, g)
	}
	for _, o := range w.observers.Get(WorldEventGuestDebug) {
		w.sendDebug(seq, o.(func(uint32, string, interface{})))
	}
	return seq
}

func (w *World) Rejoin(seq uint32) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.join(seq, w.Guests[seq])
}

func (w *World) BroadcastFrom(seq uint32, message interface{}) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.broadcast(message, seq)
}

func (w *World) UpdateGuest(seq uint32) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	g := w.Guests[seq]
	w.broadcast(MakeGuestUpdateMessage(seq, g), seq)
	for _, o := range w.observers.Get(WorldEventGuestUpdated) {
		o.(func(uint32, *Guest))(seq, g)
	}
}

func (w *World) SetGuestDebug(seq uint32, key string, value interface{}) {
	w.mutex.Lock()
	g := w.Guests[seq]
	defer w.mutex.Unlock()
	g.DebugInfo.Store(key, value)
	for _, o := range w.observers.Get(WorldEventGuestDebug) {
		o.(func(uint32, string, interface{}))(seq, key, value)
	}
}

func (w *World) RemoveGuest(seq uint32) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.broadcast(MakeClientMessage(
		"guestLeaving",
		struct {
			Id uint32 `json:"id"`
		}{seq}), seq)
	delete(w.Guests, seq)
	for _, o := range w.observers.Get(WorldEventGuestLeft) {
		o.(func(uint32))(seq)
	}
}
