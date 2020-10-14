.PHONY: deps

deps: \
	static-default/deps/three/build/three.module.js \
	static-default/deps/three/examples/jsm/loaders/GLTFLoader.js \
	static-default/deps/three/examples/jsm/utils/BufferGeometryUtils.js \
	static-default/deps/three/examples/jsm/loaders/DRACOLoader.js \
	static-default/deps/three/examples/jsm/controls/TransformControls.js \
	static-default/deps/three/examples/jsm/libs/dat.gui.module.js \
	static-management/deps/three/build/three.module.js \
	static-management/deps/three/examples/jsm/loaders/GLTFLoader.js \
	static-management/deps/three/examples/jsm/utils/BufferGeometryUtils.js \
	static-management/deps/three/examples/jsm/loaders/DRACOLoader.js \
	static-management/deps/three/examples/jsm/controls/TransformControls.js \
	static-management/deps/three/examples/jsm/controls/OrbitControls.js \
	static-management/deps/three/examples/jsm/libs/dat.gui.module.js
	
	

run: deps
	go run ./server

static-default/deps/three/%:
	mkdir -p "$(dir $@)"
	curl -Lo $@ "https://github.com/mrdoob/three.js/raw/master/$*"


static-management/deps/three/%:
	mkdir -p "$(dir $@)"
	curl -Lo $@ "https://github.com/mrdoob/three.js/raw/master/$*"

