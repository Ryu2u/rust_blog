import './LoginPage.scss'
import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {Button, Checkbox, Form, Input} from 'antd';
import { useNavigate} from "react-router";


export function LoginPage() {

    const navigate = useNavigate();

    const onFinish = (values: any) => {
        console.log('Received values of form: ', values);
        navigate("/");
    };

    return (
        <>
            <div className="login-wrapper">
                <div className="login-cell">
                    <div className={"login-div"}>
                        <Form
                            name="normal_login"
                            className="login-form"
                            initialValues={{remember: true}}
                            onFinish={onFinish}
                        >
                            <Form.Item
                                name="username"
                                rules={[{required: true, message: 'Please input your Username!'}]}
                            >
                                <Input prefix={<UserOutlined className="site-form-item-icon"/>} size={"large"} placeholder="Username"/>
                            </Form.Item>
                            <Form.Item
                                name="password"
                                rules={[{required: true, message: 'Please input your Password!'}]}
                            >
                                <Input
                                    size={"large"}
                                    prefix={<LockOutlined className="site-form-item-icon"/>}
                                    type="password"
                                    placeholder="Password"
                                />
                            </Form.Item>
                            <Form.Item>
                                <Form.Item name="remember" valuePropName="checked" noStyle>
                                    <Checkbox>Remember me</Checkbox>
                                </Form.Item>

                                {/*<a className="login-form-forgot" href="">*/}
                                {/*    Forgot password*/}
                                {/*</a>*/}
                            </Form.Item>

                            <Form.Item>
                                <Button size={"large"} type="primary" htmlType="submit" className="login-form-button">
                                    Log in
                                </Button>
                            </Form.Item>
                        </Form>
                    </div>
                </div>
            </div>
        </>
    )
}