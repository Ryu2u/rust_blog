import './App.css'
import {Admin} from "./admin/Admin";
import {BrowserRouter, Route, Routes, Navigate,} from "react-router-dom";
import {LoginPage} from "./login/LoginPage";
import {HttpEffectFragment} from "./common/AxioConfig";
import {routeConfig, getFlattenRoutes} from "./common/routerConfig";
import {createContext, useState} from "react";
import {User} from "./common/Structs";

export interface AuthContextType {
    user: User | null;
    setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    setUser: () => {},
});

function App() {
    const flattenRoutes = getFlattenRoutes();
    const [user, setUser] = useState<User | null>(null);

    return (
        <>
            <AuthContext.Provider value={{user, setUser}}>
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
            </AuthContext.Provider>
        </>
    )
}

export default App
