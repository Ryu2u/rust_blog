export function Footer() {
    return (
        <>
            <footer className={"footer"}>
                <div className={"footer__inner"}>
                    <span>© 2022–{new Date().getFullYear()} Hai Tao</span>
                    <span>用 Rust 与 React 写成</span>
                </div>
            </footer>
        </>
    )
}
