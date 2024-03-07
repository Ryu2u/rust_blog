import './home.css'
import {Card} from "../components/Card";
import {UserInfo} from "../components/UserInfo";
import {Weather} from "../components/Weather";
import {FloatButton} from "antd";
import {QuestionCircleOutlined, SettingOutlined, SyncOutlined} from '@ant-design/icons';
import {useEffect, useRef, useState} from "react";
import gfm from '@bytemd/plugin-gfm'
import './md.scss'
import {Temp} from "../components/Temp";
import {Header} from "../components/Header";
import {Footer} from "../components/Footer";
import {SideBar} from "../components/SideBar";
import {PostPage} from "../components/PostPage";

export function Home() {

    // useEffect(() => {
    //
    // }, [side_div])


    return (
        <>
            <Header/>

            <div className={"container flex"}>
                <div className={"content"}>

                </div>

                <SideBar/>
            </div>

            <Footer/>

            <FloatButton.Group shape="square" style={{right: 50}}>
                <FloatButton icon={<QuestionCircleOutlined/>}/>
                <FloatButton icon={<SettingOutlined spin/>}/>
                <FloatButton icon={<SyncOutlined/>}/>
                <FloatButton.BackTop visibilityHeight={0}/>
            </FloatButton.Group>
        </>
    )
}