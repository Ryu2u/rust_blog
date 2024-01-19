import {useState} from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Route, Routes} from "react-router";
import {Home} from "./home/Home";

function App() {
    const [count, setCount] = useState(0)

    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path={"/home"} element={<Home/>}>

                    </Route>
                </Routes>
            </BrowserRouter>

        </>
    )
}

export default App
