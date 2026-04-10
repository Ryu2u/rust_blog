import './App.css'
import {Admin} from "./admin/Admin";
import {BrowserRouter, Route, Routes, Navigate,} from "react-router-dom";
import {LoginPage} from "./login/LoginPage";
import {HttpEffectFragment} from "./common/AxioConfig";
import {routeConfig, getFlattenRoutes} from "./common/routerConfig";

function App() {
    const flattenRoutes = getFlattenRoutes();

    return (
        <>
            <BrowserRouter>
                <HttpEffectFragment/>
                <Routes>
                    <Route path={"/"} element={<Navigate to={"/dashboard"}/>}></Route>
                    <Route path={"/"} element={<Admin/>}>
                        {flattenRoutes.map((route, index) => (
                            <Route
                                key={index}
                                path={route.path}
                                element={<route.element />}
                            />
                        ))}
                    </Route>
                    <Route path={"/login"} element={<LoginPage/>}></Route>
                    <Route path={"/*"} element={<Navigate to={"/dashboard"}/>}></Route>
                </Routes>
            </BrowserRouter>
        </>
    )
}

export default App
