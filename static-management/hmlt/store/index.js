import {createStore,applyMiddleware, compose} from 'redux'
import reducers from 'reducers'





   let initialState = {} 
   let node_env = process.env.NODE_ENV;
    
    const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
    let store 

    if(node_env === "production") 
    {
        store = createStore(reducers, initialState, composeEnhancers())
    }
    else {
        store = createStore(reducers, initialState, composeEnhancers())

    }


    export default store
