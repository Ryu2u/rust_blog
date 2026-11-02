import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {CategoryPage} from "./category/CategoryPage.tsx";
import {TagPage} from "./tag/TagPage.tsx";
import {MomentPage} from "./moment/MomentPage.tsx";
import {Header} from "./components/Header";
import {Footer} from "./components/Footer";
import {AuthProvider} from "./auth/AuthProvider";
import {LoginPage} from "./login/LoginPage.tsx";
import {RequireAuth} from "./auth/RequireAuth";

function App() {

    return (
        <>
            <BrowserRouter>
                <AuthProvider>
                    <Header/>
                    <Routes>
                    <Route path={"/login"} element={<LoginPage />}></Route>
                    <Route element={<RequireAuth />}>
                        <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                        <Route path={"/home"} element={<Home />}></Route>
                        <Route path={"/post/:id"} element={<PostPage />}></Route>
                        <Route path={"/category"} element={<CategoryPage />}></Route>
                        <Route path={"/category/:tag"} element={<CategoryPage />}></Route>
                        <Route path={"/tag/:name"} element={<TagPage />}></Route>
                        <Route path={"/moment"} element={<MomentPage />}></Route>
                        <Route path={"*"} element={<Navigate to={"/home"} replace/>}></Route>
                    </Route>
                    </Routes>
                    <Footer/>
                </AuthProvider>
            </BrowserRouter>
        </>
    )
}

export default App
