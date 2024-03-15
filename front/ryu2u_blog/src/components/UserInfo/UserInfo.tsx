import "./UserInfo.scss"
import {Tooltip} from "antd";
import {useEffect, useRef} from "react";
// @ts-ignore
import * as randPoetry from "jinrishici";
import {PoetryRequestData} from "../../common/Structs";

export function UserInfo() {

    const loadingRef = useRef<boolean>(false);

    useEffect(() => {
        if (loadingRef.current) {
            return;
        }
        loadingRef.current = true;
        let dom = document.querySelector(".write_poem");
        randPoetry.load((res: PoetryRequestData) => {
            let poetry = res.data;
            console.log(`${poetry.content} --${poetry.origin.author}<${poetry.origin.title}>`);
            let data = '';
            let content = poetry.content;
            let author = poetry.origin.author;
            // let rawContent = poetry.origin.content;
            // let dynasty = poetry.origin.dynasty;
            let title = poetry.origin.title;
            data += content;
            data += `——${author}《${title}》`
            let index = 0
            if (dom) {
                writing(dom, data, index, -1).then();
            }
        })

    }, []);

    async function writing(dom: Element, data: string, index: number, flag: number) {
        if (index == data.length) {
            setTimeout(() => {
                if (index == 0 || index == data.length) {
                    flag = -flag;
                }
                index += flag;
                dom.innerHTML = data.substring(0, index);
                setTimeout(() => {
                    writing(dom, data, index, flag);
                }, 200);
            }, 2000);
        } else {
            setTimeout(() => {
                if (index == 0 || index == data.length) {
                    flag = -flag;
                }
                index += flag;
                dom.innerHTML = data.substring(0, index);
                setTimeout(() => {
                    writing(dom, data, index, flag);
                }, 200);
            })
        }
    }

    return (
        <>
            <div className={"card-widget"}>
                <div className={"user"}>
                    <div className={"avatar-wrapper"}>
                        <img alt={"avatar"} className={"user-avatar"} src={"https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/pictures%2FQQ%E5%9B%BE%E7%89%8720231118112223.jpg"}/>
                    </div>
                    <div className={"username"}>
                        <a>
                            Hai Tao
                        </a>
                    </div>
                    <div className={"info write_poem"}>
                        {/*{poetry.content} <br/>*/}
                        {/*--{poetry.origin?.author}《{poetry.origin?.title}》*/}
                    </div>

                    <div className={"divider"}>

                    </div>

                    <div className={"user-link"}>
                        <span className={"link-item"}>
                        <Tooltip title={"799021220"} color={"#2db7f5"}>
                            <a>
                            <span className={"fa fa-qq"}></span>
                                QQ
                            </a>
                        </Tooltip>
                        </span>
                        <span className={"link-item"}>
                            <a href={"https://github.com/Ryu2u"} target={"_blank"}>
                            <span className={"fa fa-github"}></span>
                                GitHub
                            </a>
                        </span>
                        <span className={"link-item"}>
                        <Tooltip title={"cht799021220"} color={"#2db7f5"}>
                            <a>
                            <span className={"fa fa-wechat"}></span>
                               WeChat
                            </a>
                        </Tooltip>
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}