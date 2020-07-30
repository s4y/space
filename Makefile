.PHONY: deps

deps: .deps.stamp

run: deps
	go run ./server

.deps.stamp: static-default/deps/three.min.js Makefile
	go get -u \
		github.com/gorilla/websocket \
		github.com/s4y/reserve \
		github.com/pion/webrtc \

	touch .deps.stamp

static-default/deps/three.min.js:
	mkdir -p static/deps && curl -Lo "$@" https://threejs.org/build/three.min.js
