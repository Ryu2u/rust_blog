import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#10a37f',
          colorBgBase: '#000000',
          colorBgContainer: '#0a0a0a',
          colorBgElevated: '#1a1a1a',
          colorBorder: '#333333',
          colorBorderSecondary: '#333333',
          colorText: '#e0e0e0',
          colorTextSecondary: '#808080',
          colorTextTertiary: '#555555',
          borderRadius: 0,
          borderRadiusLG: 0,
          borderRadiusSM: 0,
          fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
          boxShadow: 'none',
          boxShadowSecondary: 'none',
        },
        components: {
          Layout: {
            siderBg: '#000000',
            triggerBg: '#0a0a0a',
            triggerColor: '#808080',
          },
          Menu: {
            darkItemBg: '#000000',
            darkItemSelectedBg: '#10a37f',
            darkItemSelectedColor: '#000000',
            darkItemHoverBg: '#1a1a1a',
            darkItemHoverColor: '#e0e0e0',
            darkSubMenuItemBg: '#000000',
            itemBorderRadius: 0,
          },
          Card: {
            borderRadiusLG: 0,
            borderRadius: 0,
            boxShadow: 'none',
          },
          Button: {
            borderRadius: 0,
            borderRadiusLG: 0,
          },
          Input: {
            borderRadius: 0,
            activeBorderColor: '#10a37f',
            hoverBorderColor: '#555555',
          },
          Table: {
            borderRadius: 0,
            headerBg: '#0a0a0a',
            headerColor: '#e0e0e0',
            rowHoverBg: '#1a1a1a',
          },
          Tag: {
            borderRadiusSM: 0,
          },
          Modal: {
            borderRadiusLG: 0,
            contentBg: '#0a0a0a',
            headerBg: '#0a0a0a',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
