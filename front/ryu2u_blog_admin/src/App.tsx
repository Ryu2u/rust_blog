import './App.css'
import {Admin} from "./admin/Admin";
import {BrowserRouter, Route, Routes, Navigate,} from "react-router-dom";
import {Dashboard} from "./admin/dashboard/Dashboard";
import {ArticleEditPage} from "./admin/article/ArticleEditPage";
import {CommentPage} from "./admin/comment/CommentPage";
import {LoginPage} from "./login/LoginPage";
import {ArticleListPage} from "./admin/article/ArticleListPage";
import {ArticlePage} from "./admin/article/ArticlePage";
import {HttpEffectFragment} from "./common/AxioConfig";

function App() {

    return (
        <>
            <BrowserRouter>
                <HttpEffectFragment/>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/dashboard"}/>}></Route>
                    <Route path={"/"} element={<Admin/>}>
                        <Route path={"/dashboard"} element={<Dashboard/>}></Route>
                        <Route path={"/article"} element={<ArticlePage/>}>
                            <Route path={"/article/list"} element={<ArticleListPage/>}></Route>
                        </Route>
                        <Route path={"/article/new"} element={<ArticleEditPage/>}></Route>
                        <Route path={"/article/edit/:id"} element={<ArticleEditPage/>}></Route>
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
