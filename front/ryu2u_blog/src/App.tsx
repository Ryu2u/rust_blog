import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {Category} from "./category/Category";

function App() {

    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                    <Route path={"/home"} element={<Home/>}></Route>
                    <Route path={"/post/:id"} element={<PostPage/>}></Route>
                    <Route path={"/category"} element={<Category/>}></Route>
                    <Route path={"/category/:tag"} element={<Category/>}></Route>

                </Routes>
            </BrowserRouter>

        </>
    )
}

export default App
