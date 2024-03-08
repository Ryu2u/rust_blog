import "./UserInfo.scss"

export function UserInfo() {
    return (
        <>
            <div className={"card-widget"}>
                {/*<img className={"info-bg"} src="https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fsafe-img.xhscdn.com%2Fbw1%2F8c50be59-b2c5-4b83-95ab-b40dd81f0d6f%3FimageView2%2F2%2Fw%2F1080%2Fformat%2Fjpg&refer=http%3A%2F%2Fsafe-img.xhscdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1709036272&t=007daffb51fc12d2d79ff9bd224ae1c9" alt=""/>*/}
                <div className={"user"}>
                    <div className={"avatar-wrapper"}>
                        <img className={"user-avatar"} src={"https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/pictures%2FQQ%E5%9B%BE%E7%89%8720231118112223.jpg"}/>
                    </div>
                    <div className={"username"}>
                        <a>
                            Ryu2u
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
                            <a href={""}> link1 </a>
                        </span>
                        <span className={"link-item"}>
                            <a href={""}> link2 </a>
                        </span>
                        <span className={"link-item"}>
                            <a href={""}> link3 </a>
                        </span>
                        <span className={"link-item"}>
                            <a href={""}> link4 </a>
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}