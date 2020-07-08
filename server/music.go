package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
)

func makeMusicHandler() http.Handler {
	streamAddr := "127.0.0.1:8033"
	fmt.Println("Stream audio to:", streamAddr)
	ln, err := net.Listen("tcp", streamAddr)
	if err != nil {
		log.Fatal(err)
	}

	listenersMutex := sync.RWMutex{}
	var listeners []chan []byte

	go func() {
		var buf [1024]byte
		for {
			conn, err := ln.Accept()
			if err != nil {
				fmt.Println("Stream accept err:", err)
				continue
			}
			for {
				n, _ := conn.Read(buf[:])
				if n == 0 {
					break
				}
				wbuf := make([]byte, n)
				copy(wbuf, buf[:n])
				listenersMutex.RLock()
				for _, listener := range listeners {
					listener <- wbuf
				}
				listenersMutex.RUnlock()
			}
		}
	}()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		listener := make(chan []byte, 0)
		listenersMutex.Lock()
		listeners = append(listeners, listener)
		listenersMutex.Unlock()
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Cache-Control", "no-cache, no-store")
		w.WriteHeader(200)
		defer func() {
			close(listener)
			listenersMutex.Lock()
			defer listenersMutex.Unlock()
			for i, l := range listeners {
				if l != listener {
					continue
				}
				listeners = append(listeners[:i], listeners[i+1:]...)
				break
			}
		}()
		for {
			select {
			case <-r.Context().Done():
				return
			case d := <-listener:
				n, _ := w.Write(d)
				if n == 0 {
					return
				}
			}
		}
	})
}
