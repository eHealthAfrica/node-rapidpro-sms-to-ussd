'use strict';

module.exports = {
  APP_TYPE: 'ussd',
  USER_STATE_ID: 'ussd-user-session-id',
  flow: {
    TRIGGER: 'ussd',
    END_OF_SESSION: '#endOfSession'
  },
  views: {
    ALL: 'ussd/all',
    BY_CAMPAIGN_PHONE: 'ussd/by_campaign_phone',
    BY_DIRECTION: 'ussd/by_direction',
    BY_PHONE: 'ussd/by_phone',
    BY_PHONE_DIRECTION: 'ussd/by_phone_direction',
    BY_PHONE_DIRECTION_DATE: 'ussd/by_phone_direction_date'
  },
  continueFlow: {
    message: 'You did not conclude your last session, please select \n <%= YES %>. Continue \n <%= NO %>. Start Again ',
    options: {
      YES: '1',
      NO: '2'
    }
  }
};