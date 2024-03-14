import {useNavigate} from "react-router";

export function Header() {

    const navigate = useNavigate();

    function logoClick() {
        navigate('/home');
    }

    const homeClick = () => {
        navigate("/home");
    }

    return (
        <>
            <div className={"header"}>
                <div className={"flex header-item"}>
                    <div className={"logo-div"} onClick={() => logoClick()}>
                        🍑 の Blog
                    </div>
                    <div className={"header-menu"}>
                        <ul>
                            <a href={"#"} onClick={homeClick}>
                                <li>
                                    <span className={"fa fa-home"}></span>主页
                                </li>
                            </a>
                            <a href={"#"}>
                                <li>
                                    <span className={"fa fa-align-justify"}></span>分类
                                </li>
                            </a>
                            <a href={"#"}>
                                <li>
                                    <span className={"fa fa-link"}></span>链接
                                </li>
                            </a>
                            <li>
                                <a href={"#"}>
                                    <span className={"fa fa-info-circle"}></span>关于
                                </a>
                            </li>
                            <a href={"#"}>
                                <li>
                                    <span className={"fa fa-search"}></span>搜索
                                </li>
                            </a>
                        </ul>

                    </div>
                </div>
            </div>
        </>
    )
}