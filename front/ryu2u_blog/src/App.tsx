import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {CategoryPage} from "./category/CategoryPage.tsx";
import {Header} from "./components/Header";
import {Footer} from "./components/Footer";

function App() {

    return (
        <>
            <BrowserRouter>
                <Header/>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                    <Route path={"/home"} element={<Home />}></Route>
                    <Route path={"/post/:id"} element={<PostPage />}></Route>
                    <Route path={"/category"} element={<CategoryPage />}></Route>
                    <Route path={"/category/:tag"} element={<CategoryPage />}></Route>
                </Routes>
                <Footer/>
            </BrowserRouter>
        </>
    )
}

export default App
