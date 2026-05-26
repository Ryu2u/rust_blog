import { List, Avatar, Space, Typography } from 'antd';
import { FileTextOutlined, MessageOutlined, EyeOutlined, UserOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

const { Text } = Typography;

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
  const [userCount] = useState(1);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <div style={{ padding: '24px', fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace" }}>
      <div style={{ marginBottom: '24px', color: '#e0e0e0', fontSize: '14px', fontWeight: 700 }}>
        <span style={{ color: '#10a37f' }}>$</span> status
      </div>

      {/* 统计 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px',
        background: '#333333',
        border: '1px solid #333333',
        marginBottom: '24px',
      }}>
        {[
          { label: 'articles', value: articleCount, icon: <FileTextOutlined /> },
          { label: 'comments', value: commentCount, icon: <MessageOutlined /> },
          { label: 'visits', value: visitsCount, icon: <EyeOutlined /> },
          { label: 'users', value: userCount, icon: <UserOutlined /> },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: '#000000',
            padding: '20px',
            textAlign: 'center',
          }}>
            <div style={{ color: '#555555', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}>
              {stat.label}
            </div>
            <div style={{ color: '#10a37f', fontSize: '28px', fontWeight: 700, fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* 内容区域 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* 最近文章 */}
        <div style={{ border: '1px solid #333333', padding: '20px' }}>
          <div style={{
            borderBottom: '1px solid #333333',
            paddingBottom: '12px',
            marginBottom: '12px',
            color: '#e0e0e0',
            fontSize: '13px',
            fontWeight: 700,
          }}>
            <span style={{ color: '#10a37f' }}>&gt;</span> recent_posts
          </div>
          <List
            itemLayout="horizontal"
            dataSource={recentArticles}
            loading={loading}
            renderItem={(item) => (
              <List.Item
                style={{ borderBottom: '1px solid #1a1a1a' }}
                actions={[
                  <Text key="date" style={{ color: '#555555', fontSize: '12px' }}>
                    {item.created_time}
                  </Text>
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<FileTextOutlined />} style={{ background: '#0a0a0a', border: '1px solid #333333', borderRadius: 0 }} />}
                  title={
                    <a href={`/article/edit/${item.id}`} style={{ color: '#e0e0e0', fontSize: '13px' }}>
                      {item.title}
                    </a>
                  }
                  description={<span style={{ color: '#555555', fontSize: '12px' }}>by {item.author}</span>}
                />
              </List.Item>
            )}
          />
        </div>

        {/* 系统信息 */}
        <div style={{ border: '1px solid #333333', padding: '20px' }}>
          <div style={{
            borderBottom: '1px solid #333333',
            paddingBottom: '12px',
            marginBottom: '12px',
            color: '#e0e0e0',
            fontSize: '13px',
            fontWeight: 700,
          }}>
            <span style={{ color: '#10a37f' }}>&gt;</span> system_info
          </div>
          <Space direction="vertical" style={{ width: '100%' }}>
            {[
              { label: 'disk_usage', percent: 65 },
              { label: 'memory_usage', percent: 42 },
              { label: 'cpu_usage', percent: 28 },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ color: '#808080', fontSize: '12px', textTransform: 'lowercase' }}>{item.label}</Text>
                  <Text style={{ color: '#e0e0e0', fontSize: '12px' }}>{item.percent}%</Text>
                </div>
                <div style={{
                  height: '4px',
                  background: '#1a1a1a',
                  width: '100%',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${item.percent}%`,
                    background: '#10a37f',
                  }} />
                </div>
              </div>
            ))}
            <div style={{
              border: '1px solid #333333',
              padding: '12px',
              marginTop: '8px',
              background: '#0a0a0a',
            }}>
              <div style={{ color: '#808080', fontSize: '12px', marginBottom: '4px' }}>
                server_status: <span style={{ color: '#10a37f' }}>running</span>
              </div>
              <div style={{ color: '#808080', fontSize: '12px', marginBottom: '4px' }}>
                version: <span style={{ color: '#e0e0e0' }}>v1.0.0</span>
              </div>
              <div style={{ color: '#808080', fontSize: '12px' }}>
                last_update: <span style={{ color: '#e0e0e0' }}>2024-01-24</span>
              </div>
            </div>
          </Space>
        </div>
      </div>
    </div>
  )
}
