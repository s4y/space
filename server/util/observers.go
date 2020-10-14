package util

import (
	"context"
	"sync"
)

type Observers struct {
	mutex     sync.RWMutex
	observers map[context.Context]map[interface{}][]interface{}
}

func (o *Observers) Add(ctx context.Context, e interface{}, handler interface{}) {
	o.mutex.Lock()
	defer o.mutex.Unlock()
	if o.observers == nil {
		o.observers = map[context.Context]map[interface{}][]interface{}{}
	}
	obs, ok := o.observers[ctx]
	if !ok {
		obs = map[interface{}][]interface{}{}
		o.observers[ctx] = obs
		go func() {
			<-ctx.Done()
			o.mutex.Lock()
			defer o.mutex.Unlock()
			delete(o.observers, ctx)
		}()
	}
	obs[e] = append(obs[e], handler)
}

func (o *Observers) Get(e interface{}) []interface{} {
	o.mutex.RLock()
	defer o.mutex.RUnlock()
	ret := []interface{}{}
	for _, v := range o.observers {
		if obs, ok := v[e]; ok {
			ret = append(ret, obs...)
		}
	}
	return ret
}
