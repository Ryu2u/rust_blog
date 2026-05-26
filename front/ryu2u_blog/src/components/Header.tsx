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
                        <span style={{color: '#10a37f'}}>&gt;</span> blog
                    </div>
                    <div className={"header-menu"}>
                        <ul>
                            <li>
                                <a href={"#"} onClick={homeClick}>
                                    home
                                </a>
                            </li>
                            <li>
                                <a href={"#"} onClick={() => navigate("/category")}>
                                    category
                                </a>
                            </li>
                            <li>
                                <a href={"#"}>
                                    links
                                </a>
                            </li>
                            <li>
                                <a href={"#"}>
                                    about
                                </a>
                            </li>
                        </ul>

                    </div>
                </div>
            </div>
        </>
    )
}
