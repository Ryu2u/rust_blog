import {Weather} from "./Weather";
import {useEffect, useRef} from "react";
import {UserInfo} from "./UserInfo/UserInfo";
import {Card} from "./Card/Card";
import {CatalogCard} from "./Card/CatalogCard";

export function SideBar({catalogJson}) {

    useEffect(() => {

        console.log("sidebar => ");
        console.log(catalogJson);

    },[]);

    return (
        <>
            <div className={"side-list"}>
                <UserInfo/>
                <Weather/>
                <div className={"catalog"}>
                    {
                        !!catalogJson &&
                        <CatalogCard catalogJson={catalogJson}/>
                    }
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