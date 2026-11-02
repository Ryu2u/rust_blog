import {useLocation, useNavigate} from "react-router";
import {useAuth} from "../auth/authContext";

export function Header() {

    const navigate = useNavigate();
    const {pathname} = useLocation();
    const {status, user, logout} = useAuth();

    const navClass = (prefix: string) => pathname.startsWith(prefix) ? 'is-active' : '';
    // 登录页和未登录状态下只留 logo，不显示导航与用户信息
    const showMenu = status === 'authed' && !pathname.startsWith('/login');

    return (
        <>
            <header className={"header"}>
                <div className={"header-item"}>
                    <div className={"logo-div"} onClick={() => showMenu && navigate('/home')}>
                        <span className="logo-mark">H</span>
                        Hai Tao
                    </div>
                    {showMenu && (
                        <div className={"header-right"}>
                            <nav className={"header-menu"}>
                                <ul>
                                    <li>
                                        <button type="button" className={navClass('/home')} onClick={() => navigate("/home")}>
                                            首页
                                        </button>
                                    </li>
                                    <li>
                                        <button type="button" className={navClass('/category')} onClick={() => navigate("/category")}>
                                            分类
                                        </button>
                                    </li>
                                    <li>
                                        <button type="button" className={navClass('/moment')} onClick={() => navigate("/moment")}>
                                            说说
                                        </button>
                                    </li>
                                    <li className="header-menu__placeholder">
                                        <button type="button">
                                            友链
                                        </button>
                                    </li>
                                    <li className="header-menu__placeholder">
                                        <button type="button">
                                            关于
                                        </button>
                                    </li>
                                </ul>
                            </nav>
                            <div className={"header-user"}>
                                <span className={"header-user__name"}>{user?.nick_name || user?.username}</span>
                                <button type="button" className={"header-user__logout"} onClick={() => logout()}>
                                    退出
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>
        </>
    )
}
