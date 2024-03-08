import {Weather} from "./Weather";
import {useRef} from "react";
import {UserInfo} from "./UserInfo/UserInfo";
import {Card} from "./Card/Card";

export const SideBar = () => {
    const side_div=  useRef(null);

    return (
        <>
            <div className={"side-list"}>
                <div ref={side_div} className={"side-content"}>
                    <UserInfo/>
                    <Weather/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                    <Card/>
                </div>
            </div>

        </>
    )
}