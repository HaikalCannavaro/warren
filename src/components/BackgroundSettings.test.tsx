import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackgroundSettings } from './BackgroundSettings';
import { setLanguage } from '../lib/i18n';
const mock=vi.hoisted(()=>({status:vi.fn(),command:vi.fn()}));
vi.mock('../lib/backgroundChat',()=>({backgroundStatus:mock.status,backgroundCommand:mock.command}));
const profiles=[{id:'agent',name:'Leveret',url:'wss://gateway.example/api/ws',token:'gateway-placeholder',model:'',transport:'gateway' as const}];
beforeEach(()=>{setLanguage('en');mock.status.mockReset().mockResolvedValue({supported:true,enabled:false,pushReady:true});mock.command.mockReset().mockResolvedValue({});});
afterEach(cleanup);
it('configures only the selected Gateway and clears the relay token after saving',async()=>{
  render(<BackgroundSettings profiles={profiles} deviceId="device"/>);
  await screen.findByRole('combobox',{name:'Background Agent'});
  fireEvent.click(screen.getByRole('combobox',{name:'Background Agent'}));fireEvent.click(screen.getByRole('option',{name:'Leveret'}));
  fireEvent.change(screen.getByLabelText('Delivery service address'),{target:{value:'https://gateway.example/warren'}});
  fireEvent.change(screen.getByLabelText('Delivery service token'),{target:{value:'r'.repeat(32)}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Connect & enable'}));});
  expect(mock.command).toHaveBeenCalledWith('configure',{profileId:'agent',deviceId:'device',relayUrl:'https://gateway.example/warren',token:'r'.repeat(32),gatewayUrl:'wss://gateway.example/api/ws'});
  await waitFor(()=>expect((screen.getByLabelText('Delivery service token') as HTMLInputElement).value).toBe(''));
});
it('shows the platform limit honestly and offers no native enable controls in the browser',async()=>{
  mock.status.mockResolvedValue({supported:false,enabled:false});
  render(<BackgroundSettings profiles={profiles} deviceId="device"/>);
  await screen.findByText(/Available in the Android app/);
  expect(screen.queryByRole('button',{name:'Connect & enable'})).toBeNull();
});
