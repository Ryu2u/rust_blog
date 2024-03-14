import './Admin.scss'
import {useEffect, useState} from "react";
import {Outlet, useNavigate} from "react-router";

import {
    DashboardOutlined, InfoCircleOutlined, LoginOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined, MessageOutlined, ReadOutlined, ReconciliationOutlined,
} from '@ant-design/icons';
import type {MenuProps} from 'antd';
import {Avatar, Button, Layout, Menu, theme} from 'antd';
import {createElement} from "react";
import LoginService from "../service/LoginService";

const {Header, Content, Footer, Sider} = Layout;

const items: MenuProps['items'] = [
    {
        key: "/dashboard", // item 唯一标志
        title: '仪表盘', // 设置收缩时展示的悬浮标题
        label: "仪表盘", // 菜单显示在界面上的标题项
        icon: createElement(DashboardOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/article/list", // item 唯一标志
        title: '文章', // 设置收缩时展示的悬浮标题
        label: "文章", // 菜单显示在界面上的标题项
        icon: createElement(ReadOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/comment", // item 唯一标志
        title: '评论', // 设置收缩时展示的悬浮标题
        label: "评论", // 菜单显示在界面上的标题项
        icon: createElement(MessageOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/moments", // item 唯一标志
        title: '说说', // 设置收缩时展示的悬浮标题
        label: "说说", // 菜单显示在界面上的标题项
        icon: createElement(ReconciliationOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/about", // item 唯一标志
        title: '关于', // 设置收缩时展示的悬浮标题
        label: "关于", // 菜单显示在界面上的标题项
        icon: createElement(InfoCircleOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
]


export function Admin() {

    const colorTheme = "light";

    const {token: {colorBgContainer, borderRadiusLG},} = theme.useToken();

    const [collapsed, setCollapsed] = useState(false);

    const navigate = useNavigate();

    const toggleCollapsed = () => {
        setCollapsed(!collapsed);
    };

    useEffect(() => {

        window.onresize = () => {
            // console.log(window.innerWidth);
            if (window.innerWidth < 1100) {
                setCollapsed(true);
            } else {
                setCollapsed(false);
            }
        }

    }, []);

    const menuClick: MenuProps['onClick'] = (e) => {
        console.log('click ', e);
        navigate(e.key);
    };


    const logout = () => {
        LoginService.logout().then((res) => {
            if (res && res.code == 200) {
                navigate('/login');
            }
        });
    }

    return (
        <Layout hasSider className={"layout-div"}>
            <Sider
                theme={colorTheme}
                style={{overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0}}
                collapsed={collapsed}
            >
                <div className="logo">
                    Ryu2u{!collapsed && " の 后台"}
                </div>
                <Button type="default" onClick={toggleCollapsed} className={"collapsed-btn"}>
                    {collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>}
                </Button>
                <Menu theme={colorTheme}
                      mode="inline"
                      defaultSelectedKeys={['0']}
                      items={items}
                      onClick={menuClick}
                />
                <div className={"flex current-profile"}>
                    <div className={"user-avatar"}>
                        <Avatar size={40} src={<img src={"/react.svg"} alt="avatar"/>}/>
                    </div>
                    <div className={"flex profile-btn"}>
                        <div className={"profile-btn-item"}>
                            <Button>1</Button>
                        </div>
                        <div className={"profile-btn-item"}>
                            <Button shape="circle" icon={<LoginOutlined/>} onClick={logout}>
                            </Button>
                        </div>
                    </div>
                </div>
            </Sider>
            <Layout className={"layout-content"}
                    style={{
                        marginLeft: collapsed ? '73px' : '193px',
                        minHeight: '97vh'
                    }}
            >
                <Header style={{padding: '0', background: colorBgContainer}}/>
                <Content className={"content-div"}>
                    <div
                        className={"container"}
                        style={{
                            background: colorBgContainer,
                            borderRadius: borderRadiusLG,
                        }}
                    >
                        <Outlet/>
                    </div>
                </Content>
                <Footer className={"footer"} style={{textAlign: 'center'}}>
                    Ant Design ©{new Date().getFullYear()} Created by Ant UED
                </Footer>
            </Layout>
        </Layout>
    );
}