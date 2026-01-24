import { Card, Col, Row, Statistic, List, Avatar, Progress, Space, Typography } from 'antd';
import { FileTextOutlined, MessageOutlined, EyeOutlined, UserOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

const { Title, Text } = Typography;

interface Article {
  id: number;
  title: string;
  author: string;
  created_time: string;
}

export function Dashboard() {
  const [articleCount, setArticleCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [visitsCount, setVisitsCount] = useState(0);
  const [userCount, setUserCount] = useState(1);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 模拟数据加载
    setTimeout(() => {
      setArticleCount(42);
      setCommentCount(156);
      setVisitsCount(3245);
      setRecentArticles([
        { id: 1, title: 'React Hooks 最佳实践', author: 'Admin', created_time: '2024-01-20' },
        { id: 2, title: 'TypeScript 高级类型技巧', author: 'Admin', created_time: '2024-01-18' },
        { id: 3, title: 'Ant Design 组件库使用指南', author: 'Admin', created_time: '2024-01-15' },
        { id: 4, title: '前端性能优化策略', author: 'Admin', created_time: '2024-01-10' },
        { id: 5, title: 'Vue 3 Composition API 详解', author: 'Admin', created_time: '2024-01-05' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>仪表盘</Title>
      
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="文章总数" 
              value={articleCount} 
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />} 
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="评论总数" 
              value={commentCount} 
              prefix={<MessageOutlined style={{ color: '#52c41a' }} />} 
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="访问总量" 
              value={visitsCount} 
              prefix={<EyeOutlined style={{ color: '#fa8c16' }} />} 
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic 
              title="用户数量" 
              value={userCount} 
              prefix={<UserOutlined style={{ color: '#722ed1' }} />} 
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      {/* 内容区域 */}
      <Row gutter={[16, 16]}>
        {/* 最近文章 */}
        <Col xs={24} md={12}>
          <Card title="最近文章" style={{ height: '100%' }}>
            <List
              itemLayout="horizontal"
              dataSource={recentArticles}
              loading={loading}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Text key="date" type="secondary">
                      {item.created_time}
                    </Text>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<FileTextOutlined />} />}
                    title={
                      <a href={`/article/edit/${item.id}`}>
                        {item.title}
                      </a>
                    }
                    description={`作者: ${item.author}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 系统信息 */}
        <Col xs={24} md={12}>
          <Card title="系统信息" style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>磁盘使用率</Text>
                <Progress percent={65} status="active" />
              </div>
              <div>
                <Text strong>内存使用率</Text>
                <Progress percent={42} status="active" />
              </div>
              <div>
                <Text strong>CPU 使用率</Text>
                <Progress percent={28} status="active" />
              </div>
              <Card size="small" style={{ width: '100%' }}>
                <Text>服务器状态: 运行正常</Text>
                <br />
                <Text>系统版本: v1.0.0</Text>
                <br />
                <Text>最后更新: 2024-01-24</Text>
              </Card>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}