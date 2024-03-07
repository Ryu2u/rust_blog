import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/PostPage";

function App() {

    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                    <Route path={"/home"} element={<Home/>}></Route>
                    <Route path={"/post/:id"} element={<PostPage/>}></Route>

                </Routes>
            </BrowserRouter>

        </>
    )
}

export default App
