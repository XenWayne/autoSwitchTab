let currentTabId = null;
let isRunning = false;
const ALARM_NAME = 'tabSwitchAlarm';

// 从存储中获取配置
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      stayTime: 5,
      enableSwitching: false,
      shouldRefresh: true,
      noSwitchUrls: '',
      noRefreshUrls: ''
    }, (items) => {
      resolve(items);
    });
  });
}

// 获取有效的标签页列表
async function getValidTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(tab => {
      return tab.url && tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');
    });
  } catch (error) {
    console.error('获取标签页失败:', error);
    return [];
  }
}

// 根据配置过滤标签页
function filterTabsBySettings(tabs, settings) {
  const noSwitchUrls = settings.noSwitchUrls
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  return tabs.filter(tab => {
    return !noSwitchUrls.some(pattern => tab.url.includes(pattern));
  });
}

// 切换到第一个标签页（启动时使用）
async function switchToFirstTab() {
  try {
    console.log('切换到第一个标签页');

    const settings = await loadSettings();
    if (!settings.enableSwitching) {
      console.log('自动切换已禁用');
      return;
    }

    // 获取所有有效标签页
    const validTabs = await getValidTabs();
    const filteredTabs = filterTabsBySettings(validTabs, settings);

    console.log(`有效标签页数量: ${filteredTabs.length}`);

    if (filteredTabs.length === 0) {
      console.log('没有可切换的标签页');
      return;
    }

    // 切换到第一个标签页
    const firstTab = filteredTabs[0];
    console.log(`切换到第一个标签页: ${firstTab.id} (${firstTab.url})`);

    await chrome.tabs.update(firstTab.id, { active: true });
    currentTabId = firstTab.id;

    // 处理刷新 - 只刷新切换到的标签页（第一个标签页）
    if (settings.shouldRefresh) {
      const noRefreshUrls = settings.noRefreshUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      const shouldRefresh = !noRefreshUrls.some(pattern => firstTab.url.includes(pattern));
      if (shouldRefresh) {
        console.log(`刷新第一个标签页: ${firstTab.id}`);
        await chrome.tabs.reload(firstTab.id);
      } else {
        console.log(`跳过刷新第一个标签页: ${firstTab.id} (在不刷新列表中)`);
      }
    }

    console.log('切换到第一个标签页完成');

  } catch (error) {
    console.error('切换到第一个标签页错误:', error);
  }
}

// 简化的标签页切换逻辑
async function switchToNextTab() {
  try {
    console.log('开始切换标签页');
    
    const settings = await loadSettings();
    if (!settings.enableSwitching) {
      console.log('自动切换已禁用');
      return;
    }

    // 获取所有有效标签页
    const validTabs = await getValidTabs();
    const filteredTabs = filterTabsBySettings(validTabs, settings);
    
    console.log(`有效标签页数量: ${filteredTabs.length}`);
    
    if (filteredTabs.length <= 1) {
      console.log('标签页数量不足，跳过切换');
      return;
    }

    // 获取当前活动标签页
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentActiveTabId = activeTabs.length > 0 ? activeTabs[0].id : null;

    // 找到当前标签页在列表中的位置
    let currentIndex = filteredTabs.findIndex(tab => tab.id === currentActiveTabId);
    if (currentIndex === -1) {
      currentIndex = 0; // 如果找不到，从第一个开始
    }

    // 计算下一个标签页
    const nextIndex = (currentIndex + 1) % filteredTabs.length;
    const targetTab = filteredTabs[nextIndex];

    console.log(`切换到标签页: ${targetTab.id} (${targetTab.url})`);

    // 切换标签页
    await chrome.tabs.update(targetTab.id, { active: true });
    currentTabId = targetTab.id;

    // 处理刷新 - 只刷新当前切换到的标签页
    if (settings.shouldRefresh) {
      const noRefreshUrls = settings.noRefreshUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      const shouldRefresh = !noRefreshUrls.some(pattern => targetTab.url.includes(pattern));
      if (shouldRefresh) {
        console.log(`刷新标签页: ${targetTab.id}`);
        await chrome.tabs.reload(targetTab.id);
      } else {
        console.log(`跳过刷新: ${targetTab.id} (在不刷新列表中)`);
      }
    }

    console.log('切换完成');

  } catch (error) {
    console.error('切换标签页错误:', error);
  }
}

// 启动切换
async function startSwitching() {
  if (isRunning) {
    await stopSwitching();
  }

  const settings = await loadSettings();
  if (!settings.enableSwitching) {
    return;
  }

  isRunning = true;
  console.log('启动标签页切换');

  // 启动时切换到第一个标签页
  await switchToFirstTab();

  // 创建alarm
  try {
    await chrome.alarms.clear(ALARM_NAME);
    const delayInMinutes = settings.stayTime / 60;
    
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: delayInMinutes
    });
    
    console.log(`创建alarm，间隔: ${settings.stayTime}秒`);
  } catch (error) {
    console.error('创建alarm失败:', error);
  }
}

// 停止切换
async function stopSwitching() {
  console.log('停止标签页切换');
  isRunning = false;

  try {
    await chrome.alarms.clear(ALARM_NAME);
  } catch (error) {
    console.error('清除alarm失败:', error);
  }

  currentTabId = null;
}

// 监听alarm事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('Alarm触发');
    
    const settings = await loadSettings();
    if (!settings.enableSwitching) {
      await stopSwitching();
      return;
    }
    
    isRunning = true; // 确保状态正确
    await switchToNextTab();
  }
});

// 监听存储变化
chrome.storage.onChanged.addListener(async (changes) => {
  const newSettings = await loadSettings();
  if (newSettings.enableSwitching) {
    await startSwitching();
  } else {
    await stopSwitching();
  }
});

// 初始化
loadSettings().then(settings => {
  if (settings.enableSwitching) {
    startSwitching();
  }
}).catch(error => {
  console.error('初始化失败:', error);
});
