import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {Button, Checkbox, Form, Input, message} from 'antd';
import "./LoginPage.scss";
import { useNavigate} from "react-router";
import LoginService from "../service/LoginService";
import { useState } from "react";


export function LoginPage() {

    const [messageApi, contextHolder] = message.useMessage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const onFinish = (values: any) => {
        setLoading(true);
        LoginService.login(values['username'], values['password'], values['remember'])
            .then((r) => {
                messageApi.success(r.msg);
                navigate('/');
            })
            .catch((error) => {
                messageApi.error('登录失败，请检查用户名和密码');
                console.error('Login error:', error);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    return (
        <>
            {contextHolder}
            <div className="login-page">
                <div className="login-card">
                    <span className="login-card__mark">H</span>
                    <h1 className="login-card__title">欢迎回来</h1>
                    <p className="login-card__subtitle">登录 Hai Tao 的博客后台</p>
                    <Form
                        name="normal_login"
                        layout="vertical"
                        requiredMark={false}
                        initialValues={{remember: true}}
                        onFinish={onFinish}
                    >
                        <Form.Item
                            label="用户名"
                            name="username"
                            rules={[{required: true, message: '请输入用户名!'}]}
                        >
                            <Input
                                prefix={<UserOutlined className="login-card__icon"/>}
                                size="large"
                                placeholder="用户名"
                            />
                        </Form.Item>
                        <Form.Item
                            label="密码"
                            name="password"
                            rules={[{required: true, message: '请输入密码!'}]}
                        >
                            <Input
                                size="large"
                                prefix={<LockOutlined className="login-card__icon"/>}
                                type="password"
                                placeholder="密码"
                            />
                        </Form.Item>
                        <div className="login-card__row">
                            <Form.Item name="remember" valuePropName="checked" noStyle>
                                <Checkbox>记住我</Checkbox>
                            </Form.Item>
                            <a href="#">忘记密码？</a>
                        </div>
                        <Button
                            block
                            size="large"
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                        >
                            登录
                        </Button>
                    </Form>
                </div>
            </div>
        </>
    )
}
