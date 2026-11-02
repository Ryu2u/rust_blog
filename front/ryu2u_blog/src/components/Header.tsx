import {useLocation, useNavigate} from "react-router";

export function Header() {

    const navigate = useNavigate();
    const {pathname} = useLocation();

    const navClass = (prefix: string) => pathname.startsWith(prefix) ? 'is-active' : '';

    return (
        <>
            <header className={"header"}>
                <div className={"header-item"}>
                    <div className={"logo-div"} onClick={() => navigate('/home')}>
                        <span className="logo-mark">H</span>
                        Hai Tao
                    </div>
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
                                <button type="button">
                                    友链
                                </button>
                            </li>
                            <li>
                                <button type="button">
                                    关于
                                </button>
                            </li>
                        </ul>
                    </nav>
                </div>
            </header>
        </>
    )
}
