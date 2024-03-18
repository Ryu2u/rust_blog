import {Button} from "antd";
import {MoonOutlined, SunOutlined} from "@ant-design/icons";
import {useEffect, useState} from "react";
import {THEME, THEME_DARK, THEME_KEY, THEME_LIGHT} from "../common/constants";

export function FloatList() {
    const [isLight, setIsLight] = useState(true);

    useEffect(() => {
        const theme = localStorage.getItem(THEME_KEY);
        setIsLight(theme === THEME_LIGHT);
    }, []);

    const changeThemeClick = () => {
        const theme = localStorage.getItem(THEME_KEY);
        if (theme === THEME_LIGHT) {
            document.documentElement.setAttribute(THEME, THEME_DARK);
            localStorage.setItem(THEME_KEY, THEME_DARK);
            setIsLight(false);
        } else {
            document.documentElement.setAttribute(THEME, THEME_LIGHT);
            localStorage.setItem(THEME_KEY, THEME_LIGHT);
            setIsLight(true);
        }
    }

    return (
        <>
            <div className={"flex float-div"}>
                <Button className={'float-btn'} icon={
                    isLight ?
                        <MoonOutlined/>
                        :
                        <SunOutlined/>
                } onClick={changeThemeClick}/>
            </div>
        </>
    )
}
