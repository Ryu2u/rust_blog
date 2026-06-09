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
                                <button type="button" onClick={homeClick}>
                                    home
                                </button>
                            </li>
                            <li>
                                <button type="button" onClick={() => navigate("/category")}>
                                    category
                                </button>
                            </li>
                            <li>
                                <button type="button">
                                    links
                                </button>
                            </li>
                            <li>
                                <button type="button">
                                    about
                                </button>
                            </li>
                        </ul>

                    </div>
                </div>
            </div>
        </>
    )
}
