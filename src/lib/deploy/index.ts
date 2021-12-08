
import _ from 'lodash';
import PlanService from './plan-service';
import PlanFunction from './plan-function';
import PlanTrigger from './plan-trigger';
import PlanDomain from './plan-domain';

export default class PlanDeploy {
  async plan(localConfig, fcClient, subCommand) {
    const plan: any = {
      region: localConfig.region,
    };

    if (_.isEmpty(subCommand) || subCommand === 'service') {
      const getServicePlan = new PlanService(localConfig, fcClient);
      plan.service = await getServicePlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'function') {
      const getFunctionPlan = new PlanFunction(localConfig, fcClient);
      plan.function = await getFunctionPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'trigger') {
      const getTriggerPlan = new PlanTrigger(localConfig, fcClient);
      plan.triggers = await getTriggerPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'domain') {
      const getDomainPlan = new PlanDomain(localConfig, fcClient);
      plan.domains = await getDomainPlan.getPlan();
    }

    return plan;
  }
}
