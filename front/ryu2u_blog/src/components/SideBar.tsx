import {UserInfo} from "./UserInfo";
import {Weather} from "./Weather";
import {Card} from "./Card";
import {useRef} from "react";

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