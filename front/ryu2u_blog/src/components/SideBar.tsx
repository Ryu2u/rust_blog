import {Weather} from "./Weather";
import {useEffect, useState} from "react";
import {UserInfo} from "./UserInfo/UserInfo";
import {Card} from "./Card/Card";
import {CatalogCard} from "./Card/CatalogCard";

// @ts-ignore
export function SideBar({catalogJson}) {

    const [viewToc, setViewToc] = useState(false);

    useEffect(() => {
        if (catalogJson && catalogJson != '') {
            setViewToc(true);
        }
    }, [catalogJson]);

    return (
        <>
            <div className={"side-list"}>
                <UserInfo/>
                <Weather/>
            </div>

        </>
    )
}