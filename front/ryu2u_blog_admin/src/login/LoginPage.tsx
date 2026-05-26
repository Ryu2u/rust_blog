import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {Button, Checkbox, Form, Input, message, Card, Space} from 'antd';
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
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000000',
                fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
            }}>
                <Card
                    title={
                        <div style={{
                            textAlign: 'left',
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#e0e0e0',
                            fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                        }}>
                            <span style={{ color: '#10a37f' }}>&gt;</span> login
                        </div>
                    }
                    style={{
                        width: 400,
                        background: '#0a0a0a',
                        border: '1px solid #333333',
                        borderRadius: 0,
                        boxShadow: 'none',
                    }}
                    headStyle={{
                        borderBottom: '1px solid #333333',
                        background: '#0a0a0a',
                    }}
                    bodyStyle={{
                        padding: '24px',
                    }}
                >
                    <Form
                        name="normal_login"
                        initialValues={{remember: true}}
                        onFinish={onFinish}
                    >
                        <Form.Item
                            name="username"
                            rules={[{required: true, message: '请输入用户名!'}]}
                        >
                            <Input
                                prefix={<UserOutlined style={{ color: '#555555' }} />}
                                size="large"
                                placeholder="username"
                                style={{
                                    background: '#000000',
                                    border: '1px solid #333333',
                                    borderRadius: 0,
                                    color: '#e0e0e0',
                                    fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                                }}
                            />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            rules={[{required: true, message: '请输入密码!'}]}
                        >
                            <Input
                                size="large"
                                prefix={<LockOutlined style={{ color: '#555555' }} />}
                                type="password"
                                placeholder="password"
                                style={{
                                    background: '#000000',
                                    border: '1px solid #333333',
                                    borderRadius: 0,
                                    color: '#e0e0e0',
                                    fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                                }}
                            />
                        </Form.Item>
                        <Form.Item>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Form.Item name="remember" valuePropName="checked" noStyle>
                                        <Checkbox style={{ color: '#808080', fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace" }}>remember me</Checkbox>
                                    </Form.Item>
                                    <a href="#" style={{ color: '#10a37f', fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace" }}>
                                        forgot password
                                    </a>
                                </Space>
                                <Button
                                    size="large"
                                    type="primary"
                                    htmlType="submit"
                                    style={{
                                        width: '100%',
                                        height: 40,
                                        borderRadius: 0,
                                        fontWeight: 700,
                                        fontSize: 14,
                                        fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                                    }}
                                    loading={loading}
                                >
                                    $ enter
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>
            </div>
        </>
    )
}
