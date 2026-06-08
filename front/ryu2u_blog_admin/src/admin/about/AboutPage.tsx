import {Alert, Card, Col, Row, Space, Tag, Typography} from "antd";

const {Paragraph, Text} = Typography;

export function AboutPage() {
    const features = [
        "文章列表 / 新建 / 编辑 / 删除",
        "评论审核 / 拒绝 / 删除 / 批量操作",
        "用户列表 / 新建 / 编辑 / 锁定 / 删除",
        "仪表盘最近文章展示",
    ];

    const pending = [
        "说说模块目前仍是前端示例数据，后端接口尚未接入",
        "仪表盘统计项还没有全部接真实统计数据",
    ];

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid #333333',
            }}>
                <div style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 700 }}>
                    <span style={{ color: '#10a37f' }}>&gt;</span> 关于后台
                </div>
                <Space>
                    <Tag color="success">blog_admin</Tag>
                    <Tag>React + Vite + Ant Design</Tag>
                </Space>
            </div>

            <Row gutter={[16, 16]}>
                <Col span={12}>
                    <Card title="项目说明">
                        <Paragraph>
                            这是博客系统的管理后台，负责文章、评论和用户的日常运营管理。
                            当前样式已经统一到终端风格界面，用户管理也已经接入真实后端接口。
                        </Paragraph>
                        <Paragraph>
                            <Text type="secondary">API Base:</Text> http://localhost:9002
                        </Paragraph>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card title="已完成功能">
                        <Space direction="vertical">
                            {features.map((item) => (
                                <div key={item}>{item}</div>
                            ))}
                        </Space>
                    </Card>
                </Col>
                <Col span={24}>
                    <Alert
                        type="warning"
                        showIcon
                        message="仍待完善"
                        description={
                            <Space direction="vertical">
                                {pending.map((item) => (
                                    <div key={item}>{item}</div>
                                ))}
                            </Space>
                        }
                    />
                </Col>
            </Row>
        </div>
    );
}
