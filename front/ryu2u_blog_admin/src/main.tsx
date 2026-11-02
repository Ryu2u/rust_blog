import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

// 与 index.css 中的设计变量保持一致（antd token 需要具体色值）
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#c96442',
          colorInfo: '#c96442',
          colorLink: '#c96442',
          colorLinkHover: '#b5573a',
          colorBgLayout: '#faf9f5',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#d9d6cc',
          colorBorderSecondary: '#e8e6dc',
          colorSplit: '#e8e6dc',
          colorText: '#141413',
          colorTextSecondary: '#5e5d59',
          colorTextTertiary: '#87867f',
          colorTextQuaternary: '#b0aea5',
          colorFillAlter: '#faf9f5',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          fontFamily: FONT_SANS,
          boxShadow: '0 6px 24px rgba(20, 20, 19, 0.08)',
          boxShadowSecondary: '0 6px 24px rgba(20, 20, 19, 0.08)',
        },
        components: {
          Layout: {
            siderBg: '#f5f4ee',
            headerBg: '#faf9f5',
            bodyBg: '#faf9f5',
            footerBg: '#faf9f5',
            triggerBg: '#f5f4ee',
            triggerColor: '#5e5d59',
            lightSiderBg: '#f5f4ee',
            lightTriggerBg: '#f5f4ee',
            lightTriggerColor: '#5e5d59',
          },
          Menu: {
            itemBg: 'transparent',
            itemColor: '#5e5d59',
            itemHoverBg: '#ebe9e1',
            itemHoverColor: '#141413',
            itemSelectedBg: '#e8e6dc',
            itemSelectedColor: '#141413',
            itemActiveBg: '#e8e6dc',
            itemBorderRadius: 8,
            itemMarginInline: 8,
            activeBarBorderWidth: 0,
          },
          Table: {
            headerBg: '#faf9f5',
            headerColor: '#5e5d59',
            headerSplitColor: 'transparent',
            rowHoverBg: '#faf9f5',
            borderColor: '#e8e6dc',
          },
          Card: {
            headerFontSize: 16,
          },
          Button: {
            primaryShadow: 'none',
            defaultShadow: 'none',
            dangerShadow: 'none',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
