import './App.css'
import {Admin} from "./admin/Admin";
import {BrowserRouter, Route, Routes, Navigate,} from "react-router-dom";
import {Dashboard} from "./admin/dashboard/Dashboard";
import {ArticlePage} from "./admin/article/ArticlePage";
import {CommentPage} from "./admin/comment/CommentPage";
import {LoginPage} from "./login/LoginPage";

function App() {

    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/dashboard"}/>}></Route>
                    <Route path={"/"} element={<Admin/>}>
                        <Route path={"/dashboard"} element={<Dashboard/>}></Route>
                        <Route path={"/article"} element={<ArticlePage/>}></Route>
                        <Route path={"/comment"} element={<CommentPage/>}></Route>
                        <Route path={"/moments"} element={<CommentPage/>}></Route>
                    </Route>
                    <Route path={"/login"} element={<LoginPage/>}></Route>
                    <Route path={"/*"} element={<Navigate to={"/dashboard"}/>}></Route>
                </Routes>
            </BrowserRouter>
        </>
    )
}

export default App
