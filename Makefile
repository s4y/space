run: static/deps/three.min.js
	restarter ./server

static/deps/three.min.js:
	mkdir -p static/deps && curl -Lo "$@" https://threejs.org/build/three.min.js
