.PHONY: deps

deps: \
	static-default/deps/three/build/three.module.js \
	static-default/deps/three/examples/jsm/loaders/GLTFLoader.js \
	static-default/deps/three/examples/jsm/utils/BufferGeometryUtils.js \

run: deps
	cd server && go run ./main

static-default/deps/three/%:
	mkdir -p "$(dir $@)"
	curl -Lo $@ "https://github.com/mrdoob/three.js/raw/master/$*"
