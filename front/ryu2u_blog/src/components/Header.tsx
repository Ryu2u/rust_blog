import {useNavigate} from "react-router";
import {useEffect} from "react";

export function Header() {

    const navigate = useNavigate();


    function logoClick(){
        navigate('/home');
    }

    return (
        <>
            <div className={"header"}>
                <div className={"header-item"}>
                    <div className={"logo-div"} onClick={() => logoClick()}>
                        Ryu2u の Blog
                    </div>
                </div>
            </div>
        </>
    )
}