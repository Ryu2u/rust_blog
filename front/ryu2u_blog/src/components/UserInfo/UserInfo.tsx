import "./UserInfo.scss"
import {Tooltip} from "antd";

export function UserInfo() {
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
                    <div className={"info"}>
                        朝辞白帝彩云间，千里江陵一日还。 <br/>
                        --《早发白帝城 / 白帝下江陵》
                    </div>

                    <div className={"divider"}>

                    </div>

                    <div className={"user-link"}>
                        <span className={"link-item"}>
                        <Tooltip title={"799021220"} color={"#2db7f5"}>
                            <a href={"javascript:void(0)"}>
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
                            <a href={"javascript:void(0)"}>
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