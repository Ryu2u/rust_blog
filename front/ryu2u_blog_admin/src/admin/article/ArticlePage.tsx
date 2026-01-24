import {Outlet} from "react-router";
import {useEffect} from "react";
import './ArticlePage.scss'

export function ArticlePage() {

    useEffect(() => {

    }, [])

    return (
        <>
            <div className={""}>
                <Outlet/>
            </div>
        </>
    );
}