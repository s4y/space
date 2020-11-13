package knobs

import (
	"context"
	"sync"

	"github.com/s4y/space/util"
)

type KnobMessage struct {
	Name  string      `json:"name"`
	Value interface{} `json:"value"`
}

type KnobEventType int

const (
	KnobChanged KnobEventType = iota
)

type Knobs struct {
	observers util.Observers

	knobsMutex sync.RWMutex
	knobs      map[string]interface{}
}

func (k *Knobs) Observe(ctx context.Context, e KnobEventType, cb interface{}) {
	k.observers.Add(ctx, e, cb)
	switch e {
	case KnobChanged:
		changeCb := cb.(func(string, interface{}))
		for name, value := range k.Get() {
			changeCb(name, value)
		}
	}
}

func (k *Knobs) Set(name string, value interface{}) {
	k.knobsMutex.Lock()
	if k.knobs == nil {
		k.knobs = make(map[string]interface{})
	}
	k.knobs[name] = value
	k.knobsMutex.Unlock()
	for _, o := range k.observers.Get(KnobChanged) {
		o.(func(string, interface{}))(name, value)
	}
}

func (k *Knobs) Get() map[string]interface{} {
	ret := make(map[string]interface{})
	k.knobsMutex.RLock()
	for k, v := range k.knobs {
		ret[k] = v
	}
	k.knobsMutex.RUnlock()
	return ret
}
