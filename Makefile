.PHONY: deps

deps: .deps.stamp \
	static-default/deps/three/build/three.module.js \
	static-default/deps/three/examples/jsm/loaders/GLTFLoader.js \

run: deps
	go run ./server

.deps.stamp: Makefile
	go get -u \
		github.com/gorilla/websocket \
		github.com/s4y/reserve \
		github.com/pion/webrtc \

	touch .deps.stamp

static-default/deps/three/%:
	mkdir -p "$(dir $@)"
	curl -Lo $@ "https://github.com/mrdoob/three.js/raw/master/$*"
