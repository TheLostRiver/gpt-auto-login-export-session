(function attachBackgroundStep5(root, factory) {
  root.MultiPageBackgroundStep5 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep5Module() {
  function createStep5Executor(deps = {}) {
    const {
      addLog,
      generateRandomAge,
      generateRandomBirthday,
      generateRandomName,
      sendToContentScript,
    } = deps;

    async function executeStep5() {
      const { firstName, lastName } = generateRandomName();
      const age = typeof generateRandomAge === 'function'
        ? generateRandomAge()
        : null;
      const birthday = generateRandomBirthday(age ? { age } : undefined);
      const { year, month, day } = birthday;
      const resolvedAge = age || birthday?.age || (year ? new Date().getFullYear() - Number(year) : null);

      await addLog(`步骤 5：已生成姓名 ${firstName} ${lastName}，生日 ${year}-${month}-${day}`);

      await sendToContentScript('signup-page', {
        type: 'EXECUTE_NODE',
        nodeId: 'fill-profile',
        step: 5,
        source: 'background',
        payload: {
          firstName,
          lastName,
          age: resolvedAge,
          year,
          month,
          day,
        },
      });
    }

    return { executeStep5 };
  }

  return { createStep5Executor };
});
